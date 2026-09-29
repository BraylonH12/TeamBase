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
1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and configure the PostgreSQL connection and `JWT_SECRET`.
3. Create the database, then run `psql -U postgres -d teambase -f db/migrations/001_create_users.sql`.
4. Start the app with `npm run dev` and open `http://localhost:3000`.

The login and signup pages are available at `/login.html` and `/signup.html`. Signup creates a user in the `users` table with a bcrypt-hashed password; login verifies existing accounts. Both successful flows issue an HttpOnly session cookie and navigate to `/home.html`. The signup endpoint is `POST /api/auth/signup`, and login is `POST /api/auth/login`.
_Requirements_

* Install the "TeamBase" Repository locally onto device
* Run the following commands in the root folder directory through terminal
- _npm install_
- _npm start_