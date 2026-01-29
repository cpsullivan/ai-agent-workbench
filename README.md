# AI Agent Workbench

Enterprise-grade AI Agent platform with autonomous execution, workflow building, and multi-user collaboration.

## Project Status

**Phase:** Initial Setup Complete
**Version:** 0.1.0
**Next:** Phase 1.1 - Authentication & Authorization

## Technology Stack

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS
- **Backend:** Supabase Edge Functions (Deno) + PostgreSQL
- **Testing:** Vitest (unit) + Playwright (E2E)
- **State Management:** Zustand + React Query
- **Database:** PostgreSQL (via Supabase)

## Project Structure

```
ai-agent-workbench/
├── src/
│   ├── components/
│   │   ├── Auth/              # Authentication components (Phase 1.1)
│   │   ├── Settings/          # Secrets management (Phase 1.2)
│   │   ├── Workflows/         # Workflow builder (Phase 1.4)
│   │   ├── Analytics/         # Usage & cost tracking (Phase 2.2)
│   │   ├── Collaboration/     # Real-time collaboration (Phase 2.1)
│   │   └── WorkflowNodes/     # Workflow node types (Phase 2.4)
│   ├── hooks/
│   │   ├── useAuth.ts                    # (Phase 1.1)
│   │   ├── useFreeAgentSession.ts        # (Phase 1.3)
│   │   ├── useSecrets.ts                 # (Phase 1.2)
│   │   ├── useWorkflowPersistence.ts     # (Phase 1.4)
│   │   ├── useRealtimeCollaboration.ts   # (Phase 2.1)
│   │   └── useUsageMetrics.ts            # (Phase 2.2)
│   ├── lib/
│   │   ├── supabase.ts         # Supabase client
│   │   ├── functionExecutor.ts # Workflow engine (Phase 1.4)
│   │   └── sentry.ts           # Error tracking (Phase 4.1)
│   ├── pages/
│   │   └── Index.tsx           # Main application page
│   └── test/
│       ├── setup.ts            # Test configuration
│       └── factories.ts        # Test data factories
├── supabase/
│   ├── functions/              # Edge functions
│   │   └── _shared/
│   │       ├── auth.ts         # Auth middleware (Phase 1.1)
│   │       ├── rbac.ts         # Permission checking (Phase 1.1)
│   │       ├── encryption.ts   # Secrets encryption (Phase 1.2)
│   │       ├── usage-tracker.ts # Cost tracking (Phase 2.2)
│   │       └── cache.ts        # Redis caching (Phase 2.3)
│   └── migrations/             # Database migrations
├── tests/
│   ├── e2e/                    # Playwright E2E tests
│   └── performance/            # Load testing scripts
├── scripts/                    # Deployment & migration scripts
└── monitoring/                 # Grafana dashboards & alerts

```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account (for backend)

### Installation

1. Clone the repository:
```bash
cd ai-agent-workbench
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your Supabase credentials
```

4. Start development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build
- `npm test` - Run unit tests
- `npm run test:ui` - Run tests with UI
- `npm run test:coverage` - Generate coverage report
- `npm run test:e2e` - Run E2E tests
- `npm run test:e2e:ui` - Run E2E tests with UI

## Development Roadmap

### Phase 1: Critical Infrastructure (Months 1-6)
- [x] Project structure setup
- [ ] Phase 1.1: Authentication & Authorization (Weeks 1-4)
- [ ] Phase 1.2: Secrets Management (Weeks 3-6)
- [ ] Phase 1.3: Session Persistence (Weeks 5-8)
- [ ] Phase 1.4: Workflow Persistence & Versioning (Weeks 7-10)
- [ ] Phase 1.5: CI/CD Infrastructure (Weeks 9-12)
- [ ] Phase 1.6: Initial Testing - 40% coverage (Weeks 11-12)

### Phase 2: Collaboration & Scalability (Months 7-12)
- [ ] Phase 2.1: Real-Time Collaboration (Weeks 13-18)
- [ ] Phase 2.2: Cost Tracking (Weeks 17-20)
- [ ] Phase 2.3: Performance Optimization (Weeks 19-22)
- [ ] Phase 2.4: Advanced Workflow Features (Weeks 21-24)

### Phase 3: Testing & QA (Months 13-16)
- [ ] Phase 3.1: Unit & Integration Testing - 70% coverage (Weeks 13-20)
- [ ] Phase 3.2: E2E Testing (Weeks 17-22)
- [ ] Phase 3.3: Performance Testing (Weeks 21-24)
- [ ] Phase 3.4: Security Audit (Weeks 23-26)

### Phase 4: Production Hardening (Months 17-19)
- [ ] Phase 4.1: Monitoring & Observability (Weeks 25-28)
- [ ] Phase 4.2: Advanced Analytics (Weeks 27-30)
- [ ] Phase 4.3: Production Deployment (Weeks 31-36)

## Key Features (Planned)

- **Free Agent Mode:** Autonomous AI agents with three-tier memory system
- **Workflow Builder:** Visual drag-drop interface for complex workflows
- **Multi-User Collaboration:** Real-time synchronization and presence
- **Session Persistence:** Never lose your work, even on browser refresh
- **Cost Tracking:** Monitor AI API usage and costs in real-time
- **Secrets Management:** Encrypted storage for API keys and credentials
- **Role-Based Access Control:** Fine-grained permissions system
- **Template Marketplace:** Share and discover workflow templates

## Testing Requirements

- **Unit/Integration:** 70% code coverage minimum
- **E2E Tests:** All critical user flows covered
- **Performance:** Support 100 concurrent users (initial), 10,000 within 12 months
- **Uptime SLA:** 99.5% availability

## Security

- OAuth 2.0 authentication
- Role-based access control (RBAC)
- Encrypted secrets storage (pgcrypto)
- SQL injection prevention
- XSS protection
- Rate limiting

## Contributing

This is an enterprise project following a structured development plan. See the implementation plan document for details on the architecture and development phases.

## License

Proprietary - All rights reserved

## Support

For questions or issues, contact the development team.
