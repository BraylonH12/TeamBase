# TeamBase
CS415 Web Application Project:

## Description
Centralized sports organization and athletic management web application.

## Team Members
* Braylon Heavens (<bkheavens@crimson.ua.edu>)
* Eric Smith (<emsmith40@crimson.ua.edu>)

## Tech Stack
* **Frontend:** HTML, CSS, JavaScript
* **Backend:** Node.js, Express
* **Database:** PostgreSQL

## Setup Instructions

Install [PostgreSQL for Windows](https://www.postgresql.org/download/windows/) if you want a local database. The official installer includes the PostgreSQL server and command-line tools such as `psql`; select the command-line tools component if the installer offers component choices. After installation, open a new terminal and check that `psql --version` works. If Windows cannot find `psql`, add PostgreSQL's `bin` directory to your `PATH`.

1. Install Node.js, then install project dependencies with `npm install`.
2. Start PostgreSQL and create a database named `teambase` (for example, with pgAdmin or `createdb -U postgres teambase`).
3. Copy `.env.example` to `.env` and set the database connection values, including the password chosen for the local PostgreSQL `postgres` account, and a long, random `JWT_SECRET`. The example password is a placeholder and will not authenticate to your local server.
4. Apply each migration once, in order:

	```powershell
	psql -U postgres -d teambase -f db/migrations/001_create_users.sql
	psql -U postgres -d teambase -f db/migrations/002_create_team_features.sql
	psql -U postgres -d teambase -f db/migrations/003_add_coach_access.sql
	```

5. Start the app with `npm run dev` and open `http://localhost:3000`.

If login or signup reports that PostgreSQL rejected the configured credentials, update `DB_USER` and `DB_PASSWORD` in `.env` and restart the server. Keep the password in `.env`; do not commit it or send it in chat. On Windows, `psql.exe` is commonly under `C:\Program Files\PostgreSQL\<version>\bin\psql.exe`; pgAdmin can also be used to create the database and apply migrations.

You do **not** need to install or run `psql` just to create an account. After the app is connected to a PostgreSQL database and the migrations have been applied, create an account at `/signup.html`. `psql` is one way to create a local database and apply migrations; pgAdmin or a hosted database provider's SQL console can do those setup tasks instead.

To add the demo accounts to that database, run `psql -U postgres -d teambase -f db/seeds/001_test_accounts.sql`. This seed is safe to rerun without adding duplicate accounts. These shared, weak-password accounts are for controlled demo/test environments only; do not keep them on a publicly accessible production deployment.

The seed includes these local demo accounts:

| Role | Email | Password |
| --- | --- | --- |
| Owner | `Owner@email.com` | `123456` |
| Player | `Player@email.com` | `123456` |

The Owner account owns the `Warriors` basketball team. The roster contains Lebron (#23, Forward), linked to the Player account, and Larry (#30, Guard).

The login and signup pages are available at `/login.html` and `/signup.html`. Signup creates an Owner, Coach, or Player account with a bcrypt-hashed password; login verifies existing accounts. Successful flows issue an HttpOnly session cookie and navigate to `/home.html`. Authentication also accepts bearer tokens; `GET /api/auth/me` returns the current user and `POST /api/auth/logout` clears the cookie.

## Milestone 1 Verification

Run the automated checks from the repository root:

```powershell
npm test
```

To verify the main workflow manually after cloning:

1. Follow the environment setup instructions above.
2. Go to `/signup.html` to create a new Owner or Player account, or go to `/login.html` to sign in with one of the seeded test accounts.
3. Confirm that a successful login sets the session cookie and redirects to `/home.html`.
4. As an Owner, create a team, add players to its roster, and post a team announcement.
5. As an Owner, schedule an event for that team.
6. As an Owner, send a match request to an opponent team. Sign in as the receiving team's Owner, accept the request, and confirm that a game event appears on both teams' schedules.
7. As a Player, verify that the assigned team's roster, upcoming schedule, and announcements are visible.