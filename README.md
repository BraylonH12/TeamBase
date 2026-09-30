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
3. Copy `.env.example` to `.env` and set the database connection values and a long, random `JWT_SECRET`.
4. Apply each migration once, in order:

	```powershell
	psql -U postgres -d teambase -f db/migrations/001_create_users.sql
	psql -U postgres -d teambase -f db/migrations/002_create_team_features.sql
	```

5. Start the app with `npm run dev` and open `http://localhost:3000`.

You do **not** need to install or run `psql` just to create an account. After the app is connected to a PostgreSQL database and the migrations have been applied, create an account at `/signup.html`. `psql` is one way to create a local database and apply migrations; pgAdmin or a hosted database provider's SQL console can do those setup tasks instead.

To add the demo accounts to that database, run `psql -U postgres -d teambase -f db/seeds/001_test_accounts.sql`. This seed is safe to rerun without adding duplicate accounts. These shared, weak-password accounts are for controlled demo/test environments only; do not keep them on a publicly accessible production deployment.

The login and signup pages are available at `/login.html` and `/signup.html`. Signup creates an Owner or Player account with a bcrypt-hashed password; login verifies existing accounts. Successful flows issue an HttpOnly session cookie and navigate to `/home.html`. Authentication also accepts bearer tokens; `GET /api/auth/me` returns the current user and `POST /api/auth/logout` clears the cookie.

Authenticated owners can create teams with `POST /api/teams`, add roster players with `POST /api/teams/:teamId/roster`, schedule practices or games with `POST /api/teams/:teamId/events`, and post announcements with `POST /api/teams/:teamId/posts`. Players linked to a roster by their account email can read that team's roster, schedule, and posts. `GET /api/teams/mine` returns teams owned by the current Owner or assigned to the current Player, while `GET /api/teams` lists teams for opponent selection.

Owners send a match request with `POST /api/game-requests` using `team_id`, `opponent_team_id`, `proposed_date`, `proposed_time`, and `location`. `GET /api/game-requests` lists requests for their teams. Only the receiving owner can answer with `PATCH /api/game-requests/:requestId` and `{ "status": "Accepted" }` or `{ "status": "Rejected" }`. Acceptance creates both teams' confirmed game events and updates the request in one database transaction.
_Requirements_

* Install the "TeamBase" Repository locally onto device
* Run the following commands in the root folder directory through terminal
- _npm install_
- _npm start_