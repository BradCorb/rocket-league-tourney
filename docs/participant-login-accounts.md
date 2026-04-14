# Participant Login Accounts

Credentials are configured in `src/lib/participant-auth.ts`.

- Passwords are stored as salted hashes (not plain text).
- Login lockout policy: 3 failed attempts, then 5 minute lock.
- Super 4 access requires a logged-in participant session.
