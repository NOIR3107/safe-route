--
-- PostgreSQL database dump
--

-- Dumped from database version 16.6
-- Dumped by pg_dump version 16.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: affected_zones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.affected_zones (
    zone_id integer NOT NULL,
    disaster_id integer NOT NULL,
    code character varying(10) NOT NULL,
    name character varying(100) NOT NULL,
    location character varying(200) NOT NULL,
    state character varying(60),
    district character varying(60),
    population integer NOT NULL,
    priority character varying(10) NOT NULL,
    risk_level character varying(20) NOT NULL,
    severity integer NOT NULL,
    evacuated_count integer NOT NULL,
    status character varying(30) NOT NULL,
    centroid_lat double precision NOT NULL,
    centroid_lon double precision NOT NULL,
    polygon jsonb NOT NULL,
    CONSTRAINT chk_zone_evacuated_lte_population CHECK ((evacuated_count <= population)),
    CONSTRAINT chk_zone_evacuated_non_negative CHECK ((evacuated_count >= 0)),
    CONSTRAINT chk_zone_population_non_negative CHECK ((population >= 0)),
    CONSTRAINT chk_zone_priority CHECK (((priority)::text = ANY ((ARRAY['P1'::character varying, 'P2'::character varying, 'P3'::character varying, 'P4'::character varying])::text[]))),
    CONSTRAINT chk_zone_risk_level CHECK (((risk_level)::text = ANY ((ARRAY['Extreme'::character varying, 'High'::character varying, 'Moderate'::character varying, 'Low'::character varying])::text[]))),
    CONSTRAINT chk_zone_severity_range CHECK (((severity >= 1) AND (severity <= 5))),
    CONSTRAINT chk_zone_status CHECK (((status)::text = ANY ((ARRAY['Pending'::character varying, 'In Progress'::character varying, 'Partially Evacuated'::character varying, 'Evacuated'::character varying])::text[])))
);


--
-- Name: affected_zones_zone_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.affected_zones_zone_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: affected_zones_zone_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.affected_zones_zone_id_seq OWNED BY public.affected_zones.zone_id;


--
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);


--
-- Name: assignment_households; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assignment_households (
    assignment_id integer NOT NULL,
    household_id character varying(30) NOT NULL,
    "position" integer NOT NULL
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    log_id integer NOT NULL,
    user_id integer,
    action character varying(60) NOT NULL,
    entity_type character varying(60),
    entity_id integer,
    details text,
    "timestamp" timestamp with time zone NOT NULL
);


--
-- Name: audit_logs_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_logs_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_logs_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_logs_log_id_seq OWNED BY public.audit_logs.log_id;


--
-- Name: disasters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.disasters (
    disaster_id integer NOT NULL,
    type character varying(50) NOT NULL,
    title character varying(200) NOT NULL,
    description text,
    severity character varying(20) NOT NULL,
    status character varying(30) NOT NULL,
    start_date timestamp with time zone NOT NULL,
    end_date timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    created_by integer,
    CONSTRAINT chk_disaster_severity CHECK (((severity)::text = ANY ((ARRAY['Low'::character varying, 'Medium'::character varying, 'High'::character varying, 'Critical'::character varying])::text[]))),
    CONSTRAINT chk_disaster_status CHECK (((status)::text = ANY ((ARRAY['Active'::character varying, 'Under Control'::character varying, 'Resolved'::character varying])::text[])))
);


--
-- Name: disasters_disaster_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.disasters_disaster_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: disasters_disaster_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.disasters_disaster_id_seq OWNED BY public.disasters.disaster_id;


--
-- Name: evacuation_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evacuation_assignments (
    assignment_id integer NOT NULL,
    plan_id integer NOT NULL,
    zone_id integer NOT NULL,
    shelter_id integer NOT NULL,
    route_id integer,
    people_count integer NOT NULL,
    status character varying(20) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    version integer NOT NULL,
    approval character varying(20) NOT NULL,
    override_reason text,
    dispatch_minute integer NOT NULL,
    approach_minutes integer NOT NULL,
    eta_minutes integer NOT NULL,
    trips integer NOT NULL,
    trip_capacity integer NOT NULL,
    travel_minutes integer NOT NULL,
    delivered integer NOT NULL,
    base integer NOT NULL,
    explanation jsonb NOT NULL,
    CONSTRAINT chk_assignment_approval CHECK (((approval)::text = ANY ((ARRAY['Proposed'::character varying, 'Approved'::character varying, 'Overridden'::character varying])::text[]))),
    CONSTRAINT chk_assignment_people_count_positive CHECK ((people_count > 0)),
    CONSTRAINT chk_assignment_status CHECK (((status)::text = ANY ((ARRAY['Scheduled'::character varying, 'In Progress'::character varying, 'Completed'::character varying, 'Rerouted'::character varying, 'Cancelled'::character varying])::text[]))),
    CONSTRAINT chk_assignment_trips CHECK (((trips >= 1) AND (trip_capacity >= 1)))
);


--
-- Name: evacuation_assignments_assignment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.evacuation_assignments_assignment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: evacuation_assignments_assignment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.evacuation_assignments_assignment_id_seq OWNED BY public.evacuation_assignments.assignment_id;


--
-- Name: evacuation_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evacuation_plans (
    plan_id integer NOT NULL,
    disaster_id integer NOT NULL,
    created_by integer NOT NULL,
    name character varying(150) NOT NULL,
    priority character varying(20) NOT NULL,
    status character varying(20) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    CONSTRAINT chk_plan_status CHECK (((status)::text = ANY ((ARRAY['Draft'::character varying, 'Active'::character varying, 'Completed'::character varying, 'Reallocated'::character varying, 'Cancelled'::character varying])::text[])))
);


--
-- Name: evacuation_plans_plan_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.evacuation_plans_plan_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: evacuation_plans_plan_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.evacuation_plans_plan_id_seq OWNED BY public.evacuation_plans.plan_id;


--
-- Name: household_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.household_members (
    household_id character varying(30) NOT NULL,
    "position" integer NOT NULL,
    name character varying(120) NOT NULL
);


--
-- Name: households; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.households (
    household_id character varying(30) NOT NULL,
    zone_id integer,
    token character varying(40) NOT NULL,
    head_name character varying(120) NOT NULL,
    phone character varying(30) NOT NULL,
    size integer NOT NULL,
    elderly integer NOT NULL,
    children integer NOT NULL,
    disabled integer NOT NULL,
    medical integer NOT NULL,
    pets boolean NOT NULL,
    status character varying(20) NOT NULL,
    shelter_id integer,
    walk_in boolean NOT NULL,
    arrived_minute integer,
    CONSTRAINT chk_household_counts CHECK (((elderly >= 0) AND (children >= 0) AND (disabled >= 0) AND (medical >= 0))),
    CONSTRAINT chk_household_size_positive CHECK ((size > 0)),
    CONSTRAINT chk_household_status CHECK (((status)::text = ANY ((ARRAY['Awaiting'::character varying, 'Picked Up'::character varying, 'Arrived'::character varying, 'Checked In'::character varying])::text[])))
);


--
-- Name: ingest_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ingest_log (
    id integer NOT NULL,
    received_at timestamp with time zone NOT NULL,
    source character varying(40) NOT NULL,
    kind character varying(40) NOT NULL,
    payload jsonb NOT NULL,
    applied boolean NOT NULL,
    error text
);


--
-- Name: ingest_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ingest_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ingest_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ingest_log_id_seq OWNED BY public.ingest_log.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    notification_id integer NOT NULL,
    user_id integer,
    message text NOT NULL,
    type character varying(20) NOT NULL,
    status character varying(10) NOT NULL,
    "timestamp" timestamp with time zone NOT NULL,
    log_id integer,
    CONSTRAINT chk_notification_status CHECK (((status)::text = ANY ((ARRAY['Unread'::character varying, 'Read'::character varying])::text[]))),
    CONSTRAINT chk_notification_type CHECK (((type)::text = ANY ((ARRAY['INFO'::character varying, 'WARNING'::character varying, 'ALERT'::character varying, 'CRITICAL'::character varying])::text[])))
);


--
-- Name: notifications_notification_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notifications_notification_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notifications_notification_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notifications_notification_id_seq OWNED BY public.notifications.notification_id;


--
-- Name: ops_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ops_events (
    id integer NOT NULL,
    sim_minute integer NOT NULL,
    "timestamp" timestamp with time zone NOT NULL,
    level character varying(10) NOT NULL,
    title character varying(200) NOT NULL,
    detail text NOT NULL,
    CONSTRAINT chk_ops_event_level CHECK (((level)::text = ANY ((ARRAY['info'::character varying, 'warning'::character varying, 'critical'::character varying, 'success'::character varying])::text[])))
);


--
-- Name: ops_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ops_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ops_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ops_events_id_seq OWNED BY public.ops_events.id;


--
-- Name: ops_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ops_state (
    id integer NOT NULL,
    sim_minute integer NOT NULL,
    phase character varying(10) NOT NULL,
    speed integer NOT NULL,
    scenario_id character varying(60),
    duration_minutes integer NOT NULL,
    timeline jsonb NOT NULL,
    fired_event_ids jsonb NOT NULL,
    has_snapshot boolean NOT NULL,
    branched_at timestamp with time zone,
    CONSTRAINT chk_ops_state_phase CHECK (((phase)::text = ANY ((ARRAY['idle'::character varying, 'ready'::character varying, 'running'::character varying, 'paused'::character varying, 'finished'::character varying])::text[]))),
    CONSTRAINT chk_ops_state_single_row CHECK ((id = 1)),
    CONSTRAINT chk_ops_state_speed CHECK (((speed >= 1) AND (speed <= 32)))
);


--
-- Name: ops_state_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ops_state_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ops_state_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ops_state_id_seq OWNED BY public.ops_state.id;


--
-- Name: plan_version_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_version_assignments (
    version_id integer NOT NULL,
    assignment_id integer NOT NULL
);


--
-- Name: plan_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plan_versions (
    version_id integer NOT NULL,
    plan_id integer NOT NULL,
    version integer NOT NULL,
    status character varying(20) NOT NULL,
    strategy character varying(20) NOT NULL,
    sim_minute integer NOT NULL,
    created_at timestamp with time zone NOT NULL,
    approved_by integer,
    approved_at timestamp with time zone,
    trigger jsonb NOT NULL,
    unallocated jsonb NOT NULL,
    metrics jsonb NOT NULL,
    diff jsonb,
    CONSTRAINT chk_version_positive CHECK ((version > 0)),
    CONSTRAINT chk_version_status CHECK (((status)::text = ANY ((ARRAY['Proposed'::character varying, 'Approved'::character varying, 'Superseded'::character varying])::text[]))),
    CONSTRAINT chk_version_strategy CHECK (((strategy)::text = ANY ((ARRAY['greedy'::character varying, 'min-cost-flow'::character varying])::text[])))
);


--
-- Name: plan_versions_version_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.plan_versions_version_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: plan_versions_version_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.plan_versions_version_id_seq OWNED BY public.plan_versions.version_id;


--
-- Name: rescue_teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rescue_teams (
    team_id integer NOT NULL,
    name character varying(100) NOT NULL,
    members_count integer NOT NULL,
    contact_number character varying(30) NOT NULL,
    status character varying(20) NOT NULL,
    current_location character varying(120),
    plan_id integer,
    CONSTRAINT chk_team_members_positive CHECK ((members_count > 0)),
    CONSTRAINT chk_team_status CHECK (((status)::text = ANY ((ARRAY['Available'::character varying, 'Deployed'::character varying, 'Standby'::character varying])::text[])))
);


--
-- Name: rescue_teams_team_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rescue_teams_team_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rescue_teams_team_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rescue_teams_team_id_seq OWNED BY public.rescue_teams.team_id;


--
-- Name: resource_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resource_allocations (
    allocation_id integer NOT NULL,
    version_id integer NOT NULL,
    shelter_id integer NOT NULL,
    resource_id integer NOT NULL,
    quantity integer NOT NULL,
    CONSTRAINT chk_resource_allocation_quantity_positive CHECK ((quantity > 0))
);


--
-- Name: resource_allocations_allocation_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.resource_allocations_allocation_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: resource_allocations_allocation_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.resource_allocations_allocation_id_seq OWNED BY public.resource_allocations.allocation_id;


--
-- Name: resources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resources (
    resource_id integer NOT NULL,
    disaster_id integer,
    resource_type character varying(80) NOT NULL,
    quantity integer NOT NULL,
    availability character varying(20) NOT NULL,
    location character varying(150),
    per_person double precision NOT NULL,
    CONSTRAINT chk_resource_availability CHECK (((availability)::text = ANY ((ARRAY['Available'::character varying, 'Low Stock'::character varying, 'Depleted'::character varying])::text[]))),
    CONSTRAINT chk_resource_quantity_non_negative CHECK ((quantity >= 0))
);


--
-- Name: resources_resource_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.resources_resource_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: resources_resource_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.resources_resource_id_seq OWNED BY public.resources.resource_id;


--
-- Name: road_segments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.road_segments (
    segment_id integer NOT NULL,
    name character varying(120) NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL
);


--
-- Name: road_segments_segment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.road_segments_segment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: road_segments_segment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.road_segments_segment_id_seq OWNED BY public.road_segments.segment_id;


--
-- Name: route_segments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.route_segments (
    route_id integer NOT NULL,
    "position" integer NOT NULL,
    segment_id integer NOT NULL
);


--
-- Name: routes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.routes (
    route_id integer NOT NULL,
    disaster_id integer,
    zone_id integer NOT NULL,
    shelter_id integer NOT NULL,
    source character varying(120) NOT NULL,
    destination character varying(120) NOT NULL,
    distance_km double precision NOT NULL,
    travel_time double precision NOT NULL,
    risk_level character varying(20) NOT NULL,
    status character varying(20) NOT NULL,
    path jsonb NOT NULL,
    geometry_source character varying(20) NOT NULL,
    CONSTRAINT chk_route_distance_positive CHECK ((distance_km > (0)::double precision)),
    CONSTRAINT chk_route_geometry_source CHECK (((geometry_source)::text = ANY ((ARRAY['schematic'::character varying, 'osrm'::character varying])::text[]))),
    CONSTRAINT chk_route_risk_level CHECK (((risk_level)::text = ANY ((ARRAY['Low'::character varying, 'Moderate'::character varying, 'High'::character varying, 'Severe'::character varying])::text[]))),
    CONSTRAINT chk_route_status CHECK (((status)::text = ANY ((ARRAY['Open'::character varying, 'Congested'::character varying, 'Blocked'::character varying, 'Flooded'::character varying, 'Cleared'::character varying])::text[]))),
    CONSTRAINT chk_route_travel_time_non_negative CHECK ((travel_time >= (0)::double precision))
);


--
-- Name: routes_route_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.routes_route_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: routes_route_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.routes_route_id_seq OWNED BY public.routes.route_id;


--
-- Name: shelter_facilities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shelter_facilities (
    facility_id integer NOT NULL,
    shelter_id integer NOT NULL,
    facility_type character varying(40) NOT NULL,
    capacity integer,
    availability_status character varying(20) NOT NULL,
    CONSTRAINT chk_facility_availability CHECK (((availability_status)::text = ANY ((ARRAY['Available'::character varying, 'Limited'::character varying, 'Unavailable'::character varying])::text[]))),
    CONSTRAINT chk_facility_type CHECK (((facility_type)::text = ANY ((ARRAY['Medical'::character varying, 'Power'::character varying, 'Water'::character varying, 'Accessibility'::character varying, 'Pets'::character varying, 'Food'::character varying, 'Bedding'::character varying])::text[])))
);


--
-- Name: shelter_facilities_facility_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.shelter_facilities_facility_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shelter_facilities_facility_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.shelter_facilities_facility_id_seq OWNED BY public.shelter_facilities.facility_id;


--
-- Name: shelters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shelters (
    shelter_id integer NOT NULL,
    name character varying(120) NOT NULL,
    location character varying(255) NOT NULL,
    capacity integer NOT NULL,
    current_occupancy integer NOT NULL,
    status character varying(20) NOT NULL,
    latitude double precision,
    longitude double precision,
    reserved_pct double precision NOT NULL,
    walk_ins integer NOT NULL,
    CONSTRAINT chk_shelter_capacity_positive CHECK ((capacity > 0)),
    CONSTRAINT chk_shelter_occupancy_lte_capacity CHECK ((current_occupancy <= capacity)),
    CONSTRAINT chk_shelter_occupancy_non_negative CHECK ((current_occupancy >= 0)),
    CONSTRAINT chk_shelter_reserved_pct CHECK (((reserved_pct >= (0)::double precision) AND (reserved_pct <= (0.5)::double precision))),
    CONSTRAINT chk_shelter_status CHECK (((status)::text = ANY ((ARRAY['Active'::character varying, 'Full'::character varying, 'Inactive'::character varying, 'Closed'::character varying])::text[]))),
    CONSTRAINT chk_shelter_walk_ins_non_negative CHECK ((walk_ins >= 0))
);


--
-- Name: shelters_shelter_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.shelters_shelter_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shelters_shelter_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.shelters_shelter_id_seq OWNED BY public.shelters.shelter_id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    user_id integer NOT NULL,
    name character varying(100) NOT NULL,
    email character varying(120) NOT NULL,
    hashed_password character varying(255) NOT NULL,
    role character varying(40) NOT NULL,
    phone_number character varying(30),
    is_active boolean NOT NULL,
    created_at timestamp with time zone NOT NULL,
    shelter_id integer,
    team_id integer,
    CONSTRAINT chk_user_role CHECK (((role)::text = ANY ((ARRAY['Admin'::character varying, 'Emergency Authority'::character varying, 'Evacuation Coordinator'::character varying, 'Shelter Manager'::character varying, 'Transport Coordinator'::character varying, 'Response Team'::character varying, 'Relief Staff'::character varying, 'NGO Volunteer'::character varying])::text[])))
);


--
-- Name: users_user_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_user_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_user_id_seq OWNED BY public.users.user_id;


--
-- Name: vehicle_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicle_assignments (
    vehicle_assignment_id integer NOT NULL,
    assignment_id integer NOT NULL,
    vehicle_id integer NOT NULL,
    departure_time timestamp with time zone,
    arrival_time timestamp with time zone,
    status character varying(20) NOT NULL,
    CONSTRAINT chk_vehicle_assignment_status CHECK (((status)::text = ANY ((ARRAY['Assigned'::character varying, 'In Transit'::character varying, 'Completed'::character varying, 'Reassigned'::character varying])::text[])))
);


--
-- Name: vehicle_assignments_vehicle_assignment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vehicle_assignments_vehicle_assignment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vehicle_assignments_vehicle_assignment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vehicle_assignments_vehicle_assignment_id_seq OWNED BY public.vehicle_assignments.vehicle_assignment_id;


--
-- Name: vehicles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicles (
    vehicle_id integer NOT NULL,
    disaster_id integer,
    team_id integer,
    vehicle_type character varying(20) NOT NULL,
    capacity integer NOT NULL,
    status character varying(20) NOT NULL,
    current_location character varying(120) NOT NULL,
    plate_number character varying(30),
    depot_lat double precision NOT NULL,
    depot_lon double precision NOT NULL,
    position_lat double precision NOT NULL,
    position_lon double precision NOT NULL,
    position_source character varying(20) NOT NULL,
    position_at timestamp with time zone,
    CONSTRAINT chk_vehicle_capacity_positive CHECK ((capacity > 0)),
    CONSTRAINT chk_vehicle_position_source CHECK (((position_source)::text = ANY ((ARRAY['depot'::character varying, 'estimated'::character varying, 'gps'::character varying])::text[]))),
    CONSTRAINT chk_vehicle_status CHECK (((status)::text = ANY ((ARRAY['Available'::character varying, 'Assigned'::character varying, 'In Transit'::character varying, 'Maintenance'::character varying])::text[]))),
    CONSTRAINT chk_vehicle_type CHECK (((vehicle_type)::text = ANY ((ARRAY['Bus'::character varying, 'Ambulance'::character varying, 'Truck'::character varying, 'Boat'::character varying, 'Van'::character varying])::text[])))
);


--
-- Name: vehicles_vehicle_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vehicles_vehicle_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vehicles_vehicle_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vehicles_vehicle_id_seq OWNED BY public.vehicles.vehicle_id;


--
-- Name: affected_zones zone_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affected_zones ALTER COLUMN zone_id SET DEFAULT nextval('public.affected_zones_zone_id_seq'::regclass);


--
-- Name: audit_logs log_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN log_id SET DEFAULT nextval('public.audit_logs_log_id_seq'::regclass);


--
-- Name: disasters disaster_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disasters ALTER COLUMN disaster_id SET DEFAULT nextval('public.disasters_disaster_id_seq'::regclass);


--
-- Name: evacuation_assignments assignment_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evacuation_assignments ALTER COLUMN assignment_id SET DEFAULT nextval('public.evacuation_assignments_assignment_id_seq'::regclass);


--
-- Name: evacuation_plans plan_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evacuation_plans ALTER COLUMN plan_id SET DEFAULT nextval('public.evacuation_plans_plan_id_seq'::regclass);


--
-- Name: ingest_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingest_log ALTER COLUMN id SET DEFAULT nextval('public.ingest_log_id_seq'::regclass);


--
-- Name: notifications notification_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications ALTER COLUMN notification_id SET DEFAULT nextval('public.notifications_notification_id_seq'::regclass);


--
-- Name: ops_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_events ALTER COLUMN id SET DEFAULT nextval('public.ops_events_id_seq'::regclass);


--
-- Name: ops_state id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_state ALTER COLUMN id SET DEFAULT nextval('public.ops_state_id_seq'::regclass);


--
-- Name: plan_versions version_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_versions ALTER COLUMN version_id SET DEFAULT nextval('public.plan_versions_version_id_seq'::regclass);


--
-- Name: rescue_teams team_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rescue_teams ALTER COLUMN team_id SET DEFAULT nextval('public.rescue_teams_team_id_seq'::regclass);


--
-- Name: resource_allocations allocation_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_allocations ALTER COLUMN allocation_id SET DEFAULT nextval('public.resource_allocations_allocation_id_seq'::regclass);


--
-- Name: resources resource_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resources ALTER COLUMN resource_id SET DEFAULT nextval('public.resources_resource_id_seq'::regclass);


--
-- Name: road_segments segment_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.road_segments ALTER COLUMN segment_id SET DEFAULT nextval('public.road_segments_segment_id_seq'::regclass);


--
-- Name: routes route_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes ALTER COLUMN route_id SET DEFAULT nextval('public.routes_route_id_seq'::regclass);


--
-- Name: shelter_facilities facility_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shelter_facilities ALTER COLUMN facility_id SET DEFAULT nextval('public.shelter_facilities_facility_id_seq'::regclass);


--
-- Name: shelters shelter_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shelters ALTER COLUMN shelter_id SET DEFAULT nextval('public.shelters_shelter_id_seq'::regclass);


--
-- Name: users user_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN user_id SET DEFAULT nextval('public.users_user_id_seq'::regclass);


--
-- Name: vehicle_assignments vehicle_assignment_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_assignments ALTER COLUMN vehicle_assignment_id SET DEFAULT nextval('public.vehicle_assignments_vehicle_assignment_id_seq'::regclass);


--
-- Name: vehicles vehicle_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles ALTER COLUMN vehicle_id SET DEFAULT nextval('public.vehicles_vehicle_id_seq'::regclass);


--
-- Name: affected_zones affected_zones_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affected_zones
    ADD CONSTRAINT affected_zones_code_key UNIQUE (code);


--
-- Name: affected_zones affected_zones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affected_zones
    ADD CONSTRAINT affected_zones_pkey PRIMARY KEY (zone_id);


--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- Name: assignment_households assignment_households_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_households
    ADD CONSTRAINT assignment_households_pkey PRIMARY KEY (assignment_id, household_id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (log_id);


--
-- Name: disasters disasters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disasters
    ADD CONSTRAINT disasters_pkey PRIMARY KEY (disaster_id);


--
-- Name: evacuation_assignments evacuation_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evacuation_assignments
    ADD CONSTRAINT evacuation_assignments_pkey PRIMARY KEY (assignment_id);


--
-- Name: evacuation_plans evacuation_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evacuation_plans
    ADD CONSTRAINT evacuation_plans_pkey PRIMARY KEY (plan_id);


--
-- Name: household_members household_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.household_members
    ADD CONSTRAINT household_members_pkey PRIMARY KEY (household_id, "position");


--
-- Name: households households_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.households
    ADD CONSTRAINT households_pkey PRIMARY KEY (household_id);


--
-- Name: households households_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.households
    ADD CONSTRAINT households_token_key UNIQUE (token);


--
-- Name: ingest_log ingest_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingest_log
    ADD CONSTRAINT ingest_log_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (notification_id);


--
-- Name: ops_events ops_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_events
    ADD CONSTRAINT ops_events_pkey PRIMARY KEY (id);


--
-- Name: ops_state ops_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ops_state
    ADD CONSTRAINT ops_state_pkey PRIMARY KEY (id);


--
-- Name: plan_version_assignments plan_version_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_version_assignments
    ADD CONSTRAINT plan_version_assignments_pkey PRIMARY KEY (version_id, assignment_id);


--
-- Name: plan_versions plan_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_versions
    ADD CONSTRAINT plan_versions_pkey PRIMARY KEY (version_id);


--
-- Name: rescue_teams rescue_teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rescue_teams
    ADD CONSTRAINT rescue_teams_pkey PRIMARY KEY (team_id);


--
-- Name: resource_allocations resource_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_allocations
    ADD CONSTRAINT resource_allocations_pkey PRIMARY KEY (allocation_id);


--
-- Name: resources resources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resources_pkey PRIMARY KEY (resource_id);


--
-- Name: road_segments road_segments_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.road_segments
    ADD CONSTRAINT road_segments_name_key UNIQUE (name);


--
-- Name: road_segments road_segments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.road_segments
    ADD CONSTRAINT road_segments_pkey PRIMARY KEY (segment_id);


--
-- Name: route_segments route_segments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_segments
    ADD CONSTRAINT route_segments_pkey PRIMARY KEY (route_id, "position");


--
-- Name: routes routes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_pkey PRIMARY KEY (route_id);


--
-- Name: shelter_facilities shelter_facilities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shelter_facilities
    ADD CONSTRAINT shelter_facilities_pkey PRIMARY KEY (facility_id);


--
-- Name: shelters shelters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shelters
    ADD CONSTRAINT shelters_pkey PRIMARY KEY (shelter_id);


--
-- Name: plan_versions uq_plan_version; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_versions
    ADD CONSTRAINT uq_plan_version UNIQUE (plan_id, version);


--
-- Name: shelter_facilities uq_shelter_facility; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shelter_facilities
    ADD CONSTRAINT uq_shelter_facility UNIQUE (shelter_id, facility_type);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (user_id);


--
-- Name: vehicle_assignments vehicle_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_assignments
    ADD CONSTRAINT vehicle_assignments_pkey PRIMARY KEY (vehicle_assignment_id);


--
-- Name: vehicles vehicles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_pkey PRIMARY KEY (vehicle_id);


--
-- Name: vehicles vehicles_plate_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_plate_number_key UNIQUE (plate_number);


--
-- Name: ix_affected_zones_disaster_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_affected_zones_disaster_id ON public.affected_zones USING btree (disaster_id);


--
-- Name: ix_audit_logs_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_logs_action ON public.audit_logs USING btree (action);


--
-- Name: ix_audit_logs_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_logs_timestamp ON public.audit_logs USING btree ("timestamp");


--
-- Name: ix_audit_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_audit_logs_user_id ON public.audit_logs USING btree (user_id);


--
-- Name: ix_evacuation_assignments_plan_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_evacuation_assignments_plan_id ON public.evacuation_assignments USING btree (plan_id);


--
-- Name: ix_evacuation_assignments_shelter_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_evacuation_assignments_shelter_id ON public.evacuation_assignments USING btree (shelter_id);


--
-- Name: ix_evacuation_assignments_zone_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_evacuation_assignments_zone_id ON public.evacuation_assignments USING btree (zone_id);


--
-- Name: ix_evacuation_plans_disaster_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_evacuation_plans_disaster_id ON public.evacuation_plans USING btree (disaster_id);


--
-- Name: ix_households_zone_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_households_zone_id ON public.households USING btree (zone_id);


--
-- Name: ix_ingest_log_received_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_ingest_log_received_at ON public.ingest_log USING btree (received_at);


--
-- Name: ix_notifications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_notifications_user_id ON public.notifications USING btree (user_id);


--
-- Name: ix_plan_versions_plan_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_plan_versions_plan_id ON public.plan_versions USING btree (plan_id);


--
-- Name: ix_resource_allocations_version_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_resource_allocations_version_id ON public.resource_allocations USING btree (version_id);


--
-- Name: ix_resources_disaster_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_resources_disaster_id ON public.resources USING btree (disaster_id);


--
-- Name: ix_route_segments_segment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_route_segments_segment_id ON public.route_segments USING btree (segment_id);


--
-- Name: ix_routes_disaster_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_routes_disaster_id ON public.routes USING btree (disaster_id);


--
-- Name: ix_routes_shelter_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_routes_shelter_id ON public.routes USING btree (shelter_id);


--
-- Name: ix_routes_zone_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_routes_zone_id ON public.routes USING btree (zone_id);


--
-- Name: ix_shelter_facilities_shelter_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_shelter_facilities_shelter_id ON public.shelter_facilities USING btree (shelter_id);


--
-- Name: ix_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_users_email ON public.users USING btree (email);


--
-- Name: ix_vehicle_assignments_assignment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_vehicle_assignments_assignment_id ON public.vehicle_assignments USING btree (assignment_id);


--
-- Name: ix_vehicle_assignments_vehicle_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_vehicle_assignments_vehicle_id ON public.vehicle_assignments USING btree (vehicle_id);


--
-- Name: ix_vehicles_disaster_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_vehicles_disaster_id ON public.vehicles USING btree (disaster_id);


--
-- Name: ix_vehicles_team_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_vehicles_team_id ON public.vehicles USING btree (team_id);


--
-- Name: affected_zones affected_zones_disaster_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.affected_zones
    ADD CONSTRAINT affected_zones_disaster_id_fkey FOREIGN KEY (disaster_id) REFERENCES public.disasters(disaster_id) ON DELETE CASCADE;


--
-- Name: assignment_households assignment_households_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_households
    ADD CONSTRAINT assignment_households_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.evacuation_assignments(assignment_id) ON DELETE CASCADE;


--
-- Name: assignment_households assignment_households_household_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assignment_households
    ADD CONSTRAINT assignment_households_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(household_id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: disasters disasters_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.disasters
    ADD CONSTRAINT disasters_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: evacuation_assignments evacuation_assignments_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evacuation_assignments
    ADD CONSTRAINT evacuation_assignments_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.evacuation_plans(plan_id) ON DELETE CASCADE;


--
-- Name: evacuation_assignments evacuation_assignments_route_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evacuation_assignments
    ADD CONSTRAINT evacuation_assignments_route_id_fkey FOREIGN KEY (route_id) REFERENCES public.routes(route_id);


--
-- Name: evacuation_assignments evacuation_assignments_shelter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evacuation_assignments
    ADD CONSTRAINT evacuation_assignments_shelter_id_fkey FOREIGN KEY (shelter_id) REFERENCES public.shelters(shelter_id);


--
-- Name: evacuation_assignments evacuation_assignments_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evacuation_assignments
    ADD CONSTRAINT evacuation_assignments_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.affected_zones(zone_id);


--
-- Name: evacuation_plans evacuation_plans_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evacuation_plans
    ADD CONSTRAINT evacuation_plans_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(user_id);


--
-- Name: evacuation_plans evacuation_plans_disaster_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evacuation_plans
    ADD CONSTRAINT evacuation_plans_disaster_id_fkey FOREIGN KEY (disaster_id) REFERENCES public.disasters(disaster_id) ON DELETE CASCADE;


--
-- Name: household_members household_members_household_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.household_members
    ADD CONSTRAINT household_members_household_id_fkey FOREIGN KEY (household_id) REFERENCES public.households(household_id) ON DELETE CASCADE;


--
-- Name: households households_shelter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.households
    ADD CONSTRAINT households_shelter_id_fkey FOREIGN KEY (shelter_id) REFERENCES public.shelters(shelter_id) ON DELETE SET NULL;


--
-- Name: households households_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.households
    ADD CONSTRAINT households_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.affected_zones(zone_id) ON DELETE SET NULL;


--
-- Name: notifications notifications_log_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_log_id_fkey FOREIGN KEY (log_id) REFERENCES public.audit_logs(log_id) ON DELETE SET NULL;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- Name: plan_version_assignments plan_version_assignments_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_version_assignments
    ADD CONSTRAINT plan_version_assignments_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.evacuation_assignments(assignment_id) ON DELETE CASCADE;


--
-- Name: plan_version_assignments plan_version_assignments_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_version_assignments
    ADD CONSTRAINT plan_version_assignments_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.plan_versions(version_id) ON DELETE CASCADE;


--
-- Name: plan_versions plan_versions_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_versions
    ADD CONSTRAINT plan_versions_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(user_id) ON DELETE SET NULL;


--
-- Name: plan_versions plan_versions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plan_versions
    ADD CONSTRAINT plan_versions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.evacuation_plans(plan_id) ON DELETE CASCADE;


--
-- Name: resource_allocations resource_allocations_resource_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_allocations
    ADD CONSTRAINT resource_allocations_resource_id_fkey FOREIGN KEY (resource_id) REFERENCES public.resources(resource_id) ON DELETE CASCADE;


--
-- Name: resource_allocations resource_allocations_shelter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_allocations
    ADD CONSTRAINT resource_allocations_shelter_id_fkey FOREIGN KEY (shelter_id) REFERENCES public.shelters(shelter_id) ON DELETE CASCADE;


--
-- Name: resource_allocations resource_allocations_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resource_allocations
    ADD CONSTRAINT resource_allocations_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.plan_versions(version_id) ON DELETE CASCADE;


--
-- Name: resources resources_disaster_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resources
    ADD CONSTRAINT resources_disaster_id_fkey FOREIGN KEY (disaster_id) REFERENCES public.disasters(disaster_id) ON DELETE SET NULL;


--
-- Name: route_segments route_segments_route_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_segments
    ADD CONSTRAINT route_segments_route_id_fkey FOREIGN KEY (route_id) REFERENCES public.routes(route_id) ON DELETE CASCADE;


--
-- Name: route_segments route_segments_segment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_segments
    ADD CONSTRAINT route_segments_segment_id_fkey FOREIGN KEY (segment_id) REFERENCES public.road_segments(segment_id) ON DELETE CASCADE;


--
-- Name: routes routes_disaster_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_disaster_id_fkey FOREIGN KEY (disaster_id) REFERENCES public.disasters(disaster_id) ON DELETE CASCADE;


--
-- Name: routes routes_shelter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_shelter_id_fkey FOREIGN KEY (shelter_id) REFERENCES public.shelters(shelter_id) ON DELETE CASCADE;


--
-- Name: routes routes_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routes
    ADD CONSTRAINT routes_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.affected_zones(zone_id) ON DELETE CASCADE;


--
-- Name: shelter_facilities shelter_facilities_shelter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shelter_facilities
    ADD CONSTRAINT shelter_facilities_shelter_id_fkey FOREIGN KEY (shelter_id) REFERENCES public.shelters(shelter_id) ON DELETE CASCADE;


--
-- Name: users users_shelter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_shelter_id_fkey FOREIGN KEY (shelter_id) REFERENCES public.shelters(shelter_id) ON DELETE SET NULL;


--
-- Name: users users_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.rescue_teams(team_id) ON DELETE SET NULL;


--
-- Name: vehicle_assignments vehicle_assignments_assignment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_assignments
    ADD CONSTRAINT vehicle_assignments_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES public.evacuation_assignments(assignment_id) ON DELETE CASCADE;


--
-- Name: vehicle_assignments vehicle_assignments_vehicle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_assignments
    ADD CONSTRAINT vehicle_assignments_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(vehicle_id);


--
-- Name: vehicles vehicles_disaster_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_disaster_id_fkey FOREIGN KEY (disaster_id) REFERENCES public.disasters(disaster_id) ON DELETE SET NULL;


--
-- Name: vehicles vehicles_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT vehicles_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.rescue_teams(team_id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

