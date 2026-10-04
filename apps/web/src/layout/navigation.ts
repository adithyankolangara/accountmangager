/**
 * Navigation from docs/screen-map.md. Modules without a working screen are listed but marked
 * "not yet available" with the milestone that delivers them.
 */
export interface NavItem {
  label: string;
  to: string;
  /** Milestone that delivers the screen; undefined once it is available. */
  comingIn?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const navigation: NavGroup[] = [
  { label: 'Overview', items: [{ label: 'Dashboard', to: '/' }] },
  {
    label: 'Money',
    items: [
      { label: 'Transactions', to: '/transactions' },
      { label: 'Accounts', to: '/accounts' },
      { label: 'Cash & wallets', to: '/cash' },
      { label: 'Income', to: '/income' },
      { label: 'Reports', to: '/reports' },
    ],
  },
  {
    label: 'Commitments',
    items: [
      { label: 'Loans & EMIs', to: '/loans', comingIn: 'M3' },
      { label: 'Credit cards', to: '/cards', comingIn: 'M3' },
      { label: 'Chitty', to: '/chitty', comingIn: 'M3' },
      { label: 'Reminders', to: '/reminders', comingIn: 'M3' },
    ],
  },
  {
    label: 'Wealth',
    items: [
      { label: 'FD & RD', to: '/deposits', comingIn: 'M4' },
      { label: 'SIP & mutual funds', to: '/investments', comingIn: 'M4' },
      { label: 'Gold', to: '/gold', comingIn: 'M4' },
      { label: 'Net worth', to: '/net-worth', comingIn: 'M4' },
    ],
  },
  {
    label: 'Plan',
    items: [
      { label: 'Budgets', to: '/budgets', comingIn: 'M4' },
      { label: 'Goals', to: '/goals', comingIn: 'M4' },
    ],
  },
  {
    label: 'Household',
    items: [
      { label: 'Family', to: '/family', comingIn: 'M1' },
      { label: 'Settings', to: '/settings' },
    ],
  },
];
