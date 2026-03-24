# DDGRS — Digital Grievance Redressal System

A WhatsApp-based AI-powered complaint management system for universities. Students and staff submit grievances via WhatsApp, AI processes them automatically, and admins manage everything through a web dashboard.

---

## What This Project Can Do

### For Students / Staff (via WhatsApp)

- **Submit a grievance** just by messaging a WhatsApp number — no app, no website, no login needed
- **Choose anonymity** — submit with full name/role/department, or stay completely anonymous
- **Attach evidence** — send photos, audio, or video along with the complaint
- **Get intelligent follow-up questions** — if the complaint is vague, the bot asks smart clarifying questions (powered by Google Gemini AI) like "Which room is this in?" or "When did this start?"
- **Receive a tracking ID** instantly after submission (e.g. `GRV-000015`)
- **Track status anytime** by sending `track GRV-000015` — see current status and all admin remarks
- **Get notified on WhatsApp** when an admin updates or responds to the grievance

### For Admins (Web Dashboard)

- **View all grievances** in a filterable list — filter by status, department, date
- **See full grievance details** — complaint text, user info, AI-detected category, confidence score, attachments
- **Add remarks and update status** — move grievances from Submitted → In Progress → Resolved
- **Automatically notify the user** on WhatsApp the moment a remark is saved
- **Dashboard with charts** — bar charts showing grievances by department, pie charts for status breakdown
- **Reports page** — analytics and trends over time

---

## How It Works — The Technology

### 1. WhatsApp Interface (Twilio)
The user sends a WhatsApp message to a Twilio-managed number. Twilio forwards it via HTTP webhook to the bot server. The bot replies back through Twilio's API. This is how a regular WhatsApp number becomes a programmable chatbot.

### 2. Bot Server (Node.js)
The core conversation engine. It maintains a session per user and walks them through a step-by-step flow:

```
start → anonymous? → collect details → describe grievance
     → AI follow-up questions → category → confirm → submitted
```

It also handles the `track` command and the `/notify` endpoint called by the admin panel.

### 3. AI / ML Service (Python + FastAPI)
A separate Python service running on port 8000 with four AI models:

| Model | What it does | Technology |
|---|---|---|
| Grievance Classifier | Detects which department the complaint belongs to | DistilBERT (transformer model) |
| Duplicate Detector | Checks if a similar complaint was filed recently | Sentence embeddings (all-MiniLM-L6-v2) |
| SLA Predictor | Estimates resolution time in days | Rule-based ML model |
| Info Extractor | Generates smart follow-up questions for incomplete complaints | Google Gemini 2.0 Flash |

### 4. Database (Supabase / PostgreSQL)
All grievances, user details, admin actions, and remarks are stored in Supabase — a cloud PostgreSQL database. It uses Row Level Security (RLS) so only authorized users can read/write data. The bot uses a service role key to bypass RLS for backend operations.

### 5. Admin Panel (React + Vite)
A web app built with React. Admins log in, browse grievances, click into details, add remarks. When a remark is saved, it calls the bot's `/notify` endpoint which sends a WhatsApp message to the user in real time.

---

## System Architecture

```
┌─────────────────────────────────────────────────────┐
│                    USER (WhatsApp)                   │
└──────────────────────┬──────────────────────────────┘
                       │ message
                       ▼
┌─────────────────────────────────────────────────────┐
│                  TWILIO API                          │
│         (WhatsApp gateway + webhook)                 │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP POST (via ngrok)
                       ▼
┌─────────────────────────────────────────────────────┐
│            BOT SERVER — Node.js (port 3001)          │
│  • Conversation state machine                        │
│  • Calls ML service for AI features                  │
│  • Reads/writes Supabase                             │
│  • /notify endpoint for admin alerts                 │
└──────────┬──────────────────────┬───────────────────┘
           │ HTTP calls           │ DB calls
           ▼                      ▼
┌──────────────────┐   ┌─────────────────────────────┐
│  ML SERVICE      │   │   SUPABASE (PostgreSQL)      │
│  Python/FastAPI  │   │   Cloud database             │
│  port 8000       │   │   • grievances table         │
│                  │   │   • grievance_actions table  │
│  • DistilBERT    │   │   • profiles table           │
│  • MiniLM        │   └──────────────┬──────────────┘
│  • SLA model     │                  │
│  • Gemini API    │                  │ DB calls
└──────────────────┘                  ▼
                       ┌─────────────────────────────┐
                       │  ADMIN PANEL — React         │
                       │  Vite dev server (port 5173) │
                       │  • Dashboard + charts        │
                       │  • Grievance list + detail   │
                       │  • Calls /notify on remark   │
                       └─────────────────────────────┘
```

---

## Tech Stack Summary

| Layer | Technology |
|---|---|
| WhatsApp gateway | Twilio API |
| Bot server | Node.js, Express |
| AI/ML service | Python, FastAPI, PyTorch |
| NLP classification | DistilBERT (HuggingFace Transformers) |
| Semantic similarity | Sentence-Transformers (all-MiniLM-L6-v2) |
| Intelligent questioning | Google Gemini 2.0 Flash |
| Database | Supabase (PostgreSQL) |
| Admin frontend | React, Vite, Recharts |
| Tunnel (local dev) | ngrok |

---

## Key Flows

### Grievance Submission Flow
1. User sends "start" on WhatsApp
2. Bot asks: anonymous or with details?
3. If with details: collects name, role, department
4. User describes the grievance
5. Gemini analyzes it and asks up to 3 follow-up questions if incomplete
6. DistilBERT classifies the department automatically
7. Duplicate detector checks for similar recent complaints
8. SLA predictor estimates resolution time
9. User confirms → grievance saved to Supabase → tracking ID sent back

### Admin Remark + Notification Flow
1. Admin logs into the web dashboard
2. Opens a grievance, types a remark, updates status
3. Admin panel saves the remark to Supabase (`grievance_actions` table)
4. Admin panel calls `POST /notify` on the bot server
5. Bot looks up the user's WhatsApp number from the grievance
6. Bot sends a WhatsApp message to the user with the remark and new status
7. User can reply `track GRV-XXXXXX` to see the full update history
