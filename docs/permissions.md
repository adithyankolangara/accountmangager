# SmartFin permission matrix

Status: **Design.** Enforced in `services/api/src/authz` from M1, and tested by the authorization suite in CI.

## 1. Principles

1. **Deny by default.** No rule means no access.
2. **Ownership first.** Every financial record has exactly one owner, the user who created it, or the recipient after an ownership transfer.
3. **Membership grants nothing by itself.** Being in a family, even as its owner, doesn't reveal a member's private records.
4. **Sharing is explicit and revocable.** Access comes only from the record's `visibility` setting or a `sharing_grant`. Revocation takes effect on the next request; nothing is cached on the client as a right.
5. **The role is a ceiling.** A member's family role caps what any share can give them. Example: a read-only member who receives an "edit" share can still only view.
6. **The server decides.** Roles and memberships are loaded from the database for each request. Clients never send them.

## 2. Family management capabilities

| Action                                                     |              Owner              |                     Admin                     | Member | Read-only |       Custom       |
| ---------------------------------------------------------- | :-----------------------------: | :-------------------------------------------: | :----: | :-------: | :----------------: |
| View family name and member list                           |               ✅                |                      ✅                       |   ✅   |    ✅     |         ✅         |
| Rename family, change base currency                        |               ✅                |                      ✅                       |   —    |     —     |         —          |
| Invite members (email or link)                             |               ✅                |                      ✅                       |   —    |     —     | if `family.invite` |
| Resend or revoke pending invitations                       |               ✅                | ✅ (own invitations + any member-role invite) |   —    |     —     | if `family.invite` |
| Change a member's role                                     |               ✅                |   ✅ for member, read-only and custom only    |   —    |     —     |         —          |
| Promote to admin or demote an admin                        |               ✅                |                       —                       |   —    |     —     |         —          |
| Remove a member                                            |               ✅                |           ✅ for non-admin members            |   —    |     —     |         —          |
| Transfer ownership (target must accept)                    |               ✅                |                       —                       |   —    |     —     |         —          |
| Delete family (only after other members are removed)       |               ✅                |                       —                       |   —    |     —     |         —          |
| Leave family                                               | ✅ after transferring ownership |                      ✅                       |   ✅   |    ✅     |         ✅         |
| Manage family integrations (Firebase sync)                 |               ✅                |                      ✅                       |   —    |     —     |         —          |
| View family audit log (membership and sharing events only) |               ✅                |                      ✅                       |   —    |     —     |         —          |

When a member is removed, their records stay with them. Their shares into the family stop applying, and other people's shares to them are revoked.

## 3. Role ceilings on shared financial records

These limits apply to records owned by **someone else** that the user can see. On their own records, a user has full rights whatever their role.

| Role      |    view    |  create*   |    edit    |   delete   |   export   | share |
| --------- | :--------: | :--------: | :--------: | :--------: | :--------: | :---: |
| Owner     |     ✅     |     ✅     |     ✅     | grant only |     ✅     |   —   |
| Admin     |     ✅     |     ✅     |     ✅     | grant only |     ✅     |   —   |
| Member    |     ✅     |     ✅     |     ✅     | grant only |     ✅     |   —   |
| Read-only |     ✅     |     —      |     —      |     —      |     ✅     |   —   |
| Custom    | per module | per module | per module | per module | per module |   —   |

\* _create_ on someone else's record means adding child rows to it, for example recording a payment against a shared loan's installment or adding a transaction to a shared joint account. New top-level records are always owned by their creator.

- **Re-sharing:** only the record's owner can change its visibility or grants. Nobody can pass on a share they received.
- **Delete:** a non-owner can delete only with an explicit `delete` grant (for example, a joint-account co-holder). `family` visibility never gives delete.
- **Read-only members** can't create anything, not even private records of their own. Custom roles default to the member ceiling, then narrow it per module.

**Custom-role modules:** `accounts`, `transactions`, `income`, `deposits`, `investments` (SIP/MF), `gold`, `loans`, `cards`, `cash`, `chitty`, `budgets`, `goals`, `reminders`, `reports`. Each module takes a subset of `view`, `create`, `edit`, `delete`, `export`.

## 4. Record visibility

| `visibility` | Who can see it                                                     | Effective rights for a non-owner                                             |
| ------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `private`    | Owner only                                                         | none                                                                         |
| `selected`   | Owner plus grantees in `sharing_grants` (not revoked, not expired) | grant permissions ∩ role ceiling                                             |
| `family`     | Owner plus **active** members of `record.family_id`                | `family_access` (`view` or `edit`) ∩ role ceiling, plus any individual grant |

Records created inside a family default to `private`. The user must pick a wider scope, and the UI shows who will be able to see the record before saving.

Child rows (installments, entries, statements, valuations) inherit their parent record's access. They have no separate visibility.

## 5. Decision procedure

```
can(user, action, record):
  if record.deleted_at is not null and action != 'restore': deny
  if record.owner_id == user.id: allow
  ceiling = roleCeiling(membership(user, record.family_id), module(record), action)
  if ceiling denies: deny
  rights = {}
  if record.visibility == 'family' and membership(user, record.family_id).status == 'active':
      rights ∪= familyAccessRights(record.family_access)        # view | view+edit+create
  grant = activeGrant(record, user)                              # not revoked, not expired
  if grant and record.visibility in ('selected', 'family'):
      rights ∪= grant.permissions
  return action ∈ rights ? allow : deny
```

List and aggregate queries compile the same logic into SQL:

```sql
where deleted_at is null and (
  owner_id = :me
  or (visibility = 'family' and family_id in (:my_active_family_ids))
  or (visibility in ('selected','family') and exists (
        select 1 from sharing_grants g
        where g.record_type = :type and g.record_id = t.id and g.grantee_id = :me
          and g.revoked_at is null and (g.expires_at is null or g.expires_at > now())
          and 'view' = any(g.permissions)))
)
```

Role ceilings for `view` are applied to that predicate too. A custom role without `transactions.view`, for example, drops the family and grant branches for transactions.

## 6. Aggregation rules (dashboards, reports)

- **Personal view:** only records the viewer owns.
- **Member view** (for example, a spouse): records owned by that member that the viewer can see through the rules above. It never shows more than the viewer is allowed to see.
- **Family view:** records owned by any active member and visible to the viewer, **de-duplicated by record id**. A joint account is one record shared with the co-holder, so it's counted once.
- Every figure built from partial visibility says so ("Includes 4 of 6 family accounts shared with you").

## 7. Exports and audit

- Exports use the same predicate plus the `export` right. A user can export only rows they could open one by one.
- These actions are audited: login and logout, failed login, password or email change, session revocation, invitation actions, role changes, ownership transfer, every sharing change, export generation and download, soft and hard deletes, edits to financial records (changed field names, plus amounts before and after), integration consent and disconnect, and account deletion.

## 8. Required authorization tests (M1 onwards)

| #   | Scenario                                                     | Expected                         |
| --- | ------------------------------------------------------------ | -------------------------------- |
| A1  | User B requests user A's private record by id                | 404 (no existence leak)          |
| A2  | User B lists transactions                                    | A's private rows absent          |
| A3  | Family owner reads a member's private account                | 404                              |
| A4  | Member reads a `family`/`view` record, then tries to edit it | read 200, edit 403               |
| A5  | Read-only member with an `edit` grant tries to edit          | 403                              |
| A6  | Grant revoked, then the next request                         | 404                              |
| A7  | Member removed from family, then reads a family record       | 404                              |
| A8  | Grant expires                                                | 404 after `expires_at`           |
| A9  | Export by a user without the `export` right                  | 403, and no file created         |
| A10 | Family total with a joint account shared to both spouses     | Counted once                     |
| A11 | Client sends `role: "owner"` in a body or header             | Ignored, role loaded server-side |
| A12 | Admin tries to remove the owner or another admin             | 403                              |
