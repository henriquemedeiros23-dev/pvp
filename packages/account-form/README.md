# @pvp/account-form

## What it does

Checks the two parts of the Account screen (issue #46) before anything goes to the server: **Log in** (name +
password) and **Create an account** (name + password + the same password again). Kid-friendly messages, and which
box (`field`) the message belongs to. The server still decides (it checks the name again and whether someone has it).

## How to use

```js
import { checkSignupForm, checkLoginForm, PASSWORDS_DIFFERENT_MESSAGE } from '@pvp/account-form';

checkSignupForm({ name: 'Stick_Kid', password: 'secret1', repeat: 'secret2' });
// { ok: false, field: 'repeat', reason: 'passwords-different', message: 'The passwords are not the same. Try again.' }
checkSignupForm({ name: ' Stick_Kid ', password: 'secret1', repeat: 'secret1' });
// { ok: true, name: 'Stick_Kid', password: 'secret1' }
checkSignupForm({ name: '<rude name>', password: 'secret1', repeat: 'secret1' });
// { ok: false, field: 'name', reason: 'bad-word', message: "You can't use that name. Please pick a new name." }

checkLoginForm({ name: '', password: 'x' }); // { ok: false, field: 'name', reason: 'missing', message: 'Type a name and a password' }
```

Reasons: `missing`, `password-short` (fewer than `MIN_PASSWORD` = 4 characters, like `@pvp/accounts-shop`),
`passwords-different`, and the `@pvp/name-filter` reasons (`bad-word`, `too-short`, `too-long`, `bad-chars`). The name is
checked first. Log in only checks that something is typed, so an old name that would not pass today still logs in.

Also exported: `MIN_PASSWORD`, `PASSWORDS_DIFFERENT_MESSAGE`, `MISSING_MESSAGE`, `PASSWORD_SHORT_MESSAGE`.

## Determinism

Fully deterministic: pure functions of the typed text (and the fixed name-filter word lists). No DOM, storage, time or randomness.
