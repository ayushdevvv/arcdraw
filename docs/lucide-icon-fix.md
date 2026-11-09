# Lucide icon compatibility fix

The auth screen uses only the icon names from the previously working AuthPage implementation:

- `Globe` for the Google sign-in action
- `GitBranch` for the GitHub sign-in action

No `Chrome` or `Github` exports are imported from `lucide-react`.
The OAuth handlers and callback behavior are unchanged.
