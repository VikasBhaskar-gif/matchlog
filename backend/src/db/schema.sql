--
-- PostgreSQL database dump
--

\restrict pLuydPv0AmDm8vROqPFNy4bPzuyFsWCrVybRiLbx0RzeTRCggRFPlLDqUDPgOBH

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: drizzle; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA drizzle;


--
-- Name: friend_activity_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.friend_activity_type AS ENUM (
    'WATCHED_MATCH',
    'MADE_PREDICTION',
    'UNLOCKED_ACHIEVEMENT',
    'REACHED_LEVEL'
);


--
-- Name: friend_request_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.friend_request_status AS ENUM (
    'PENDING',
    'ACCEPTED',
    'DECLINED',
    'CANCELLED'
);


--
-- Name: knockout_advance; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.knockout_advance AS ENUM (
    'HOME',
    'AWAY'
);


--
-- Name: match_event_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.match_event_type AS ENUM (
    'GOAL',
    'OWN_GOAL',
    'PENALTY_GOAL',
    'RED_CARD',
    'YELLOW_CARD',
    'SUBSTITUTION'
);


--
-- Name: match_source; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.match_source AS ENUM (
    'OPENFOOTBALL',
    'FOOTBALL_DATA_ORG',
    'API_FOOTBALL',
    'DEMO'
);


--
-- Name: match_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.match_status AS ENUM (
    'SCHEDULED',
    'LIVE',
    'PAUSED',
    'FINISHED',
    'POSTPONED',
    'CANCELLED',
    'SUSPENDED'
);


--
-- Name: predicted_outcome; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.predicted_outcome AS ENUM (
    'HOME',
    'DRAW',
    'AWAY'
);


--
-- Name: sync_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sync_status AS ENUM (
    'SUCCESS',
    'FAILURE',
    'PARTIAL'
);


--
-- Name: watch_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.watch_type AS ENUM (
    'FULL_MATCH',
    'FIRST_HALF',
    'SECOND_HALF',
    'CUSTOM'
);


--
-- Name: xp_source_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.xp_source_type AS ENUM (
    'MATCH_WATCH',
    'WATCH_ADJUSTMENT',
    'STREAK_BONUS',
    'ACHIEVEMENT',
    'FIRST_FOLLOWED_TEAM_MATCH',
    'FIRST_FOLLOWED_COMPETITION_MATCH',
    'OTHER'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: __drizzle_migrations; Type: TABLE; Schema: drizzle; Owner: -
--

CREATE TABLE drizzle.__drizzle_migrations (
    id integer NOT NULL,
    hash text NOT NULL,
    created_at bigint
);


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE; Schema: drizzle; Owner: -
--

CREATE SEQUENCE drizzle.__drizzle_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: drizzle; Owner: -
--

ALTER SEQUENCE drizzle.__drizzle_migrations_id_seq OWNED BY drizzle.__drizzle_migrations.id;


--
-- Name: achievements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.achievements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    icon text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: competition_seasons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.competition_seasons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    competition_id uuid NOT NULL,
    season_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: competitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.competitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    external_id text NOT NULL,
    name text NOT NULL,
    short_name text,
    country text,
    logo_url text,
    type text DEFAULT 'league'::text NOT NULL,
    is_knockout boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source public.match_source DEFAULT 'OPENFOOTBALL'::public.match_source NOT NULL,
    is_supported boolean DEFAULT true NOT NULL
);


--
-- Name: followed_competitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.followed_competitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    competition_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: followed_players; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.followed_players (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    player_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: followed_teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.followed_teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    team_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: friend_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.friend_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type public.friend_activity_type NOT NULL,
    summary text NOT NULL,
    reference_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: friend_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.friend_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sender_id uuid NOT NULL,
    receiver_id uuid NOT NULL,
    status public.friend_request_status DEFAULT 'PENDING'::public.friend_request_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT friend_requests_no_self_request CHECK ((sender_id <> receiver_id))
);


--
-- Name: friendships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.friendships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_a_id uuid NOT NULL,
    user_b_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT friendships_no_self_friend CHECK ((user_a_id <> user_b_id)),
    CONSTRAINT friendships_ordered_pair CHECK ((user_a_id < user_b_id))
);


--
-- Name: match_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.match_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    match_id uuid NOT NULL,
    team_id uuid,
    player_id uuid,
    type public.match_event_type NOT NULL,
    minute integer NOT NULL,
    external_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: match_players; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.match_players (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    match_id uuid NOT NULL,
    player_id uuid NOT NULL,
    team_id uuid NOT NULL,
    is_starter boolean DEFAULT false NOT NULL,
    minutes_played integer,
    goals integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tactical_position text,
    formation_place integer,
    sub_in_minute integer
);


--
-- Name: match_review_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.match_review_likes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    review_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: match_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.match_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    match_id uuid NOT NULL,
    content text,
    match_quality_rating smallint,
    referee_rating smallint,
    likes_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT review_content_length CHECK ((char_length(content) <= 10000))
);


--
-- Name: matches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.matches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    external_id text NOT NULL,
    season_id uuid NOT NULL,
    competition_id uuid NOT NULL,
    home_team_id uuid,
    away_team_id uuid,
    home_team_placeholder text,
    away_team_placeholder text,
    kickoff_at timestamp with time zone NOT NULL,
    status public.match_status DEFAULT 'SCHEDULED'::public.match_status NOT NULL,
    home_score integer,
    away_score integer,
    home_score_extra_time integer,
    away_score_extra_time integer,
    went_to_penalties boolean DEFAULT false NOT NULL,
    home_penalties integer,
    away_penalties integer,
    went_to_extra_time boolean DEFAULT false NOT NULL,
    venue text,
    round text,
    is_knockout boolean DEFAULT false NOT NULL,
    max_watch_minutes integer DEFAULT 90 NOT NULL,
    last_synced_at timestamp with time zone,
    predictions_processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source public.match_source DEFAULT 'OPENFOOTBALL'::public.match_source NOT NULL,
    kickoff_time_confirmed boolean DEFAULT true NOT NULL,
    home_score_half_time integer,
    away_score_half_time integer,
    home_formation text,
    away_formation text,
    actual_kickoff_at timestamp with time zone
);


--
-- Name: player_of_match_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_of_match_votes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    match_id uuid NOT NULL,
    player_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: players; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.players (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    external_id text NOT NULL,
    name text NOT NULL,
    photo_url text,
    "position" text,
    nationality text,
    current_team_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source public.match_source DEFAULT 'OPENFOOTBALL'::public.match_source NOT NULL
);


--
-- Name: predicted_goalscorers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.predicted_goalscorers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    prediction_id uuid NOT NULL,
    player_id uuid NOT NULL,
    was_correct boolean,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: predictions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.predictions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    match_id uuid NOT NULL,
    predicted_outcome public.predicted_outcome NOT NULL,
    predicted_home_score smallint NOT NULL,
    predicted_away_score smallint NOT NULL,
    predicted_goes_to_extra_time boolean,
    predicted_goes_to_penalties boolean,
    predicted_advancing_side public.knockout_advance,
    points_awarded integer,
    scored_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: seasons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seasons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    external_id text NOT NULL,
    name text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id text NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: sync_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sync_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_name text NOT NULL,
    status public.sync_status NOT NULL,
    items_processed integer DEFAULT 0 NOT NULL,
    message text,
    started_at timestamp with time zone NOT NULL,
    finished_at timestamp with time zone NOT NULL
);


--
-- Name: teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    external_id text NOT NULL,
    name text NOT NULL,
    short_name text,
    logo_url text,
    country text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source public.match_source DEFAULT 'OPENFOOTBALL'::public.match_source NOT NULL
);


--
-- Name: user_achievements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_achievements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    achievement_id uuid NOT NULL,
    unlocked_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_follows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_follows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    follower_id uuid NOT NULL,
    following_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username text NOT NULL,
    email text,
    password_hash text NOT NULL,
    avatar text,
    total_xp integer DEFAULT 0 NOT NULL,
    current_streak integer DEFAULT 0 NOT NULL,
    longest_streak integer DEFAULT 0 NOT NULL,
    last_watched_match_kickoff timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    display_name text,
    supported_team_id uuid,
    onboarding_completed boolean DEFAULT false NOT NULL
);


--
-- Name: watched_matches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.watched_matches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    match_id uuid NOT NULL,
    watch_type public.watch_type NOT NULL,
    start_minute smallint NOT NULL,
    end_minute smallint NOT NULL,
    watch_duration_minutes smallint NOT NULL,
    xp_earned integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: xp_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xp_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    source_type public.xp_source_type NOT NULL,
    source_id uuid,
    xp_amount integer NOT NULL,
    description text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: __drizzle_migrations id; Type: DEFAULT; Schema: drizzle; Owner: -
--

ALTER TABLE ONLY drizzle.__drizzle_migrations ALTER COLUMN id SET DEFAULT nextval('drizzle.__drizzle_migrations_id_seq'::regclass);


--
-- Name: __drizzle_migrations __drizzle_migrations_pkey; Type: CONSTRAINT; Schema: drizzle; Owner: -
--

ALTER TABLE ONLY drizzle.__drizzle_migrations
    ADD CONSTRAINT __drizzle_migrations_pkey PRIMARY KEY (id);


--
-- Name: achievements achievements_code_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievements
    ADD CONSTRAINT achievements_code_unique UNIQUE (code);


--
-- Name: achievements achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.achievements
    ADD CONSTRAINT achievements_pkey PRIMARY KEY (id);


--
-- Name: competition_seasons competition_seasons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competition_seasons
    ADD CONSTRAINT competition_seasons_pkey PRIMARY KEY (id);


--
-- Name: competitions competitions_external_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competitions
    ADD CONSTRAINT competitions_external_id_unique UNIQUE (external_id);


--
-- Name: competitions competitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competitions
    ADD CONSTRAINT competitions_pkey PRIMARY KEY (id);


--
-- Name: followed_competitions followed_competitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followed_competitions
    ADD CONSTRAINT followed_competitions_pkey PRIMARY KEY (id);


--
-- Name: followed_players followed_players_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followed_players
    ADD CONSTRAINT followed_players_pkey PRIMARY KEY (id);


--
-- Name: followed_teams followed_teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followed_teams
    ADD CONSTRAINT followed_teams_pkey PRIMARY KEY (id);


--
-- Name: friend_activities friend_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_activities
    ADD CONSTRAINT friend_activities_pkey PRIMARY KEY (id);


--
-- Name: friend_requests friend_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_requests
    ADD CONSTRAINT friend_requests_pkey PRIMARY KEY (id);


--
-- Name: friendships friendships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_pkey PRIMARY KEY (id);


--
-- Name: match_events match_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_events
    ADD CONSTRAINT match_events_pkey PRIMARY KEY (id);


--
-- Name: match_players match_players_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_players
    ADD CONSTRAINT match_players_pkey PRIMARY KEY (id);


--
-- Name: match_review_likes match_review_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_review_likes
    ADD CONSTRAINT match_review_likes_pkey PRIMARY KEY (id);


--
-- Name: match_reviews match_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_reviews
    ADD CONSTRAINT match_reviews_pkey PRIMARY KEY (id);


--
-- Name: matches matches_external_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_external_id_unique UNIQUE (external_id);


--
-- Name: matches matches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_pkey PRIMARY KEY (id);


--
-- Name: player_of_match_votes player_of_match_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_of_match_votes
    ADD CONSTRAINT player_of_match_votes_pkey PRIMARY KEY (id);


--
-- Name: players players_external_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.players
    ADD CONSTRAINT players_external_id_unique UNIQUE (external_id);


--
-- Name: players players_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.players
    ADD CONSTRAINT players_pkey PRIMARY KEY (id);


--
-- Name: predicted_goalscorers predicted_goalscorers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predicted_goalscorers
    ADD CONSTRAINT predicted_goalscorers_pkey PRIMARY KEY (id);


--
-- Name: predictions predictions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predictions
    ADD CONSTRAINT predictions_pkey PRIMARY KEY (id);


--
-- Name: seasons seasons_external_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seasons
    ADD CONSTRAINT seasons_external_id_unique UNIQUE (external_id);


--
-- Name: seasons seasons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seasons
    ADD CONSTRAINT seasons_pkey PRIMARY KEY (id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: sync_logs sync_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_logs
    ADD CONSTRAINT sync_logs_pkey PRIMARY KEY (id);


--
-- Name: teams teams_external_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_external_id_unique UNIQUE (external_id);


--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- Name: user_achievements user_achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_pkey PRIMARY KEY (id);


--
-- Name: user_follows user_follows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_follows
    ADD CONSTRAINT user_follows_pkey PRIMARY KEY (id);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_username_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_username_unique UNIQUE (username);


--
-- Name: watched_matches watched_matches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watched_matches
    ADD CONSTRAINT watched_matches_pkey PRIMARY KEY (id);


--
-- Name: xp_transactions xp_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xp_transactions
    ADD CONSTRAINT xp_transactions_pkey PRIMARY KEY (id);


--
-- Name: competition_seasons_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX competition_seasons_unique ON public.competition_seasons USING btree (competition_id, season_id);


--
-- Name: followed_competitions_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX followed_competitions_unique ON public.followed_competitions USING btree (user_id, competition_id);


--
-- Name: followed_competitions_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX followed_competitions_user_idx ON public.followed_competitions USING btree (user_id);


--
-- Name: followed_players_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX followed_players_unique ON public.followed_players USING btree (user_id, player_id);


--
-- Name: followed_players_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX followed_players_user_idx ON public.followed_players USING btree (user_id);


--
-- Name: followed_teams_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX followed_teams_unique ON public.followed_teams USING btree (user_id, team_id);


--
-- Name: followed_teams_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX followed_teams_user_idx ON public.followed_teams USING btree (user_id);


--
-- Name: friend_activities_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX friend_activities_user_idx ON public.friend_activities USING btree (user_id, created_at);


--
-- Name: friend_requests_pending_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX friend_requests_pending_unique ON public.friend_requests USING btree (sender_id, receiver_id) WHERE (status = 'PENDING'::public.friend_request_status);


--
-- Name: friend_requests_receiver_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX friend_requests_receiver_idx ON public.friend_requests USING btree (receiver_id);


--
-- Name: friend_requests_sender_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX friend_requests_sender_idx ON public.friend_requests USING btree (sender_id);


--
-- Name: friendships_pair_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX friendships_pair_unique ON public.friendships USING btree (user_a_id, user_b_id);


--
-- Name: friendships_user_a_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX friendships_user_a_idx ON public.friendships USING btree (user_a_id);


--
-- Name: friendships_user_b_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX friendships_user_b_idx ON public.friendships USING btree (user_b_id);


--
-- Name: match_events_external_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX match_events_external_unique ON public.match_events USING btree (match_id, external_id);


--
-- Name: match_events_match_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX match_events_match_idx ON public.match_events USING btree (match_id);


--
-- Name: match_players_match_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX match_players_match_idx ON public.match_players USING btree (match_id);


--
-- Name: match_players_player_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX match_players_player_idx ON public.match_players USING btree (player_id);


--
-- Name: match_players_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX match_players_unique ON public.match_players USING btree (match_id, player_id);


--
-- Name: match_review_likes_review_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX match_review_likes_review_idx ON public.match_review_likes USING btree (review_id);


--
-- Name: match_review_likes_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX match_review_likes_unique ON public.match_review_likes USING btree (user_id, review_id);


--
-- Name: match_reviews_match_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX match_reviews_match_idx ON public.match_reviews USING btree (match_id);


--
-- Name: match_reviews_user_match_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX match_reviews_user_match_unique ON public.match_reviews USING btree (user_id, match_id);


--
-- Name: matches_away_team_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX matches_away_team_idx ON public.matches USING btree (away_team_id);


--
-- Name: matches_competition_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX matches_competition_idx ON public.matches USING btree (competition_id);


--
-- Name: matches_home_team_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX matches_home_team_idx ON public.matches USING btree (home_team_id);


--
-- Name: matches_kickoff_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX matches_kickoff_idx ON public.matches USING btree (kickoff_at);


--
-- Name: matches_season_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX matches_season_idx ON public.matches USING btree (season_id);


--
-- Name: matches_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX matches_status_idx ON public.matches USING btree (status);


--
-- Name: potm_votes_match_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX potm_votes_match_idx ON public.player_of_match_votes USING btree (match_id);


--
-- Name: potm_votes_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX potm_votes_unique ON public.player_of_match_votes USING btree (user_id, match_id);


--
-- Name: predicted_goalscorers_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX predicted_goalscorers_unique ON public.predicted_goalscorers USING btree (prediction_id, player_id);


--
-- Name: predictions_match_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX predictions_match_idx ON public.predictions USING btree (match_id);


--
-- Name: predictions_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX predictions_unique ON public.predictions USING btree (user_id, match_id);


--
-- Name: predictions_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX predictions_user_idx ON public.predictions USING btree (user_id);


--
-- Name: sessions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sessions_user_id_idx ON public.sessions USING btree (user_id);


--
-- Name: user_achievements_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_achievements_unique ON public.user_achievements USING btree (user_id, achievement_id);


--
-- Name: user_follows_follower_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_follows_follower_idx ON public.user_follows USING btree (follower_id);


--
-- Name: user_follows_following_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_follows_following_idx ON public.user_follows USING btree (following_id);


--
-- Name: user_follows_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_follows_unique ON public.user_follows USING btree (follower_id, following_id);


--
-- Name: users_email_lower_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_lower_idx ON public.users USING btree (lower(email)) WHERE (email IS NOT NULL);


--
-- Name: users_username_lower_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_username_lower_idx ON public.users USING btree (lower(username));


--
-- Name: watched_matches_match_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX watched_matches_match_idx ON public.watched_matches USING btree (match_id);


--
-- Name: watched_matches_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX watched_matches_unique ON public.watched_matches USING btree (user_id, match_id);


--
-- Name: watched_matches_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX watched_matches_user_idx ON public.watched_matches USING btree (user_id);


--
-- Name: xp_transactions_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xp_transactions_source_idx ON public.xp_transactions USING btree (source_type, source_id);


--
-- Name: xp_transactions_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX xp_transactions_user_idx ON public.xp_transactions USING btree (user_id);


--
-- Name: competition_seasons competition_seasons_competition_id_competitions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competition_seasons
    ADD CONSTRAINT competition_seasons_competition_id_competitions_id_fk FOREIGN KEY (competition_id) REFERENCES public.competitions(id) ON DELETE CASCADE;


--
-- Name: competition_seasons competition_seasons_season_id_seasons_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.competition_seasons
    ADD CONSTRAINT competition_seasons_season_id_seasons_id_fk FOREIGN KEY (season_id) REFERENCES public.seasons(id) ON DELETE CASCADE;


--
-- Name: followed_competitions followed_competitions_competition_id_competitions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followed_competitions
    ADD CONSTRAINT followed_competitions_competition_id_competitions_id_fk FOREIGN KEY (competition_id) REFERENCES public.competitions(id) ON DELETE CASCADE;


--
-- Name: followed_competitions followed_competitions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followed_competitions
    ADD CONSTRAINT followed_competitions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: followed_players followed_players_player_id_players_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followed_players
    ADD CONSTRAINT followed_players_player_id_players_id_fk FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: followed_players followed_players_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followed_players
    ADD CONSTRAINT followed_players_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: followed_teams followed_teams_team_id_teams_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followed_teams
    ADD CONSTRAINT followed_teams_team_id_teams_id_fk FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: followed_teams followed_teams_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.followed_teams
    ADD CONSTRAINT followed_teams_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: friend_activities friend_activities_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_activities
    ADD CONSTRAINT friend_activities_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: friend_requests friend_requests_receiver_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_requests
    ADD CONSTRAINT friend_requests_receiver_id_users_id_fk FOREIGN KEY (receiver_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: friend_requests friend_requests_sender_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friend_requests
    ADD CONSTRAINT friend_requests_sender_id_users_id_fk FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: friendships friendships_user_a_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_user_a_id_users_id_fk FOREIGN KEY (user_a_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: friendships friendships_user_b_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_user_b_id_users_id_fk FOREIGN KEY (user_b_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: match_events match_events_match_id_matches_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_events
    ADD CONSTRAINT match_events_match_id_matches_id_fk FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;


--
-- Name: match_events match_events_player_id_players_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_events
    ADD CONSTRAINT match_events_player_id_players_id_fk FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE SET NULL;


--
-- Name: match_events match_events_team_id_teams_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_events
    ADD CONSTRAINT match_events_team_id_teams_id_fk FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;


--
-- Name: match_players match_players_match_id_matches_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_players
    ADD CONSTRAINT match_players_match_id_matches_id_fk FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;


--
-- Name: match_players match_players_player_id_players_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_players
    ADD CONSTRAINT match_players_player_id_players_id_fk FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: match_players match_players_team_id_teams_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_players
    ADD CONSTRAINT match_players_team_id_teams_id_fk FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: match_review_likes match_review_likes_review_id_match_reviews_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_review_likes
    ADD CONSTRAINT match_review_likes_review_id_match_reviews_id_fk FOREIGN KEY (review_id) REFERENCES public.match_reviews(id) ON DELETE CASCADE;


--
-- Name: match_review_likes match_review_likes_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_review_likes
    ADD CONSTRAINT match_review_likes_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: match_reviews match_reviews_match_id_matches_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_reviews
    ADD CONSTRAINT match_reviews_match_id_matches_id_fk FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;


--
-- Name: match_reviews match_reviews_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_reviews
    ADD CONSTRAINT match_reviews_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: matches matches_away_team_id_teams_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_away_team_id_teams_id_fk FOREIGN KEY (away_team_id) REFERENCES public.teams(id) ON DELETE SET NULL;


--
-- Name: matches matches_competition_id_competitions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_competition_id_competitions_id_fk FOREIGN KEY (competition_id) REFERENCES public.competitions(id) ON DELETE RESTRICT;


--
-- Name: matches matches_home_team_id_teams_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_home_team_id_teams_id_fk FOREIGN KEY (home_team_id) REFERENCES public.teams(id) ON DELETE SET NULL;


--
-- Name: matches matches_season_id_seasons_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_season_id_seasons_id_fk FOREIGN KEY (season_id) REFERENCES public.seasons(id) ON DELETE RESTRICT;


--
-- Name: player_of_match_votes player_of_match_votes_match_id_matches_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_of_match_votes
    ADD CONSTRAINT player_of_match_votes_match_id_matches_id_fk FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;


--
-- Name: player_of_match_votes player_of_match_votes_player_id_players_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_of_match_votes
    ADD CONSTRAINT player_of_match_votes_player_id_players_id_fk FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: player_of_match_votes player_of_match_votes_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_of_match_votes
    ADD CONSTRAINT player_of_match_votes_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: players players_current_team_id_teams_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.players
    ADD CONSTRAINT players_current_team_id_teams_id_fk FOREIGN KEY (current_team_id) REFERENCES public.teams(id) ON DELETE SET NULL;


--
-- Name: predicted_goalscorers predicted_goalscorers_player_id_players_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predicted_goalscorers
    ADD CONSTRAINT predicted_goalscorers_player_id_players_id_fk FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;


--
-- Name: predicted_goalscorers predicted_goalscorers_prediction_id_predictions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predicted_goalscorers
    ADD CONSTRAINT predicted_goalscorers_prediction_id_predictions_id_fk FOREIGN KEY (prediction_id) REFERENCES public.predictions(id) ON DELETE CASCADE;


--
-- Name: predictions predictions_match_id_matches_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predictions
    ADD CONSTRAINT predictions_match_id_matches_id_fk FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;


--
-- Name: predictions predictions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.predictions
    ADD CONSTRAINT predictions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_achievements user_achievements_achievement_id_achievements_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_achievement_id_achievements_id_fk FOREIGN KEY (achievement_id) REFERENCES public.achievements(id) ON DELETE CASCADE;


--
-- Name: user_achievements user_achievements_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_achievements
    ADD CONSTRAINT user_achievements_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_follows user_follows_follower_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_follows
    ADD CONSTRAINT user_follows_follower_id_users_id_fk FOREIGN KEY (follower_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_follows user_follows_following_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_follows
    ADD CONSTRAINT user_follows_following_id_users_id_fk FOREIGN KEY (following_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_supported_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_supported_team_id_fkey FOREIGN KEY (supported_team_id) REFERENCES public.teams(id) ON DELETE SET NULL;


--
-- Name: watched_matches watched_matches_match_id_matches_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watched_matches
    ADD CONSTRAINT watched_matches_match_id_matches_id_fk FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;


--
-- Name: watched_matches watched_matches_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.watched_matches
    ADD CONSTRAINT watched_matches_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: xp_transactions xp_transactions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xp_transactions
    ADD CONSTRAINT xp_transactions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict pLuydPv0AmDm8vROqPFNy4bPzuyFsWCrVybRiLbx0RzeTRCggRFPlLDqUDPgOBH

