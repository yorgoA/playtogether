CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  birthday TEXT NOT NULL,
  avatar TEXT NOT NULL,
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL
);
CREATE TABLE profile_sessions (
  token TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  expires INTEGER NOT NULL
);
