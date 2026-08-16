export type VettedCandidateRecord = {
  id: string;
  name: string;
  role: string;
  skills: string[];
  integrity_score: number;
  execution_score: number;
  bio: string;
  repos_count: number;
  audited_at: string;
  major: string;
  rating: string;
  status: string;
  experienceLevel: string;
  roleType: string;
  availability: string;
  github: string;
  demoVideo: string;
  projects: string[];
  email?: string;
  phone?: string;
  linkedin_url?: string;
  github_url?: string;
};

export const VETTED_CANDIDATE_POOL: VettedCandidateRecord[] = [
  {
    id: "C-801",
    name: "Priya Nair",
    role: "AI/ML Engineer",
    skills: ["PyTorch", "RAG Pipelines", "MLOps"],
    integrity_score: 98,
    execution_score: 98,
    bio: "Shipped production RAG systems with traceable eval harnesses. Commit history shows deep model iteration.",
    repos_count: 11,
    audited_at: "2026-08-14T18:00:00.000Z",
    major: "M.S. Machine Learning, Georgia Tech",
    rating: "98%",
    status: "Open for Hire",
    experienceLevel: "Senior+",
    roleType: "Engineering",
    availability: "Available Now",
    github: "github.com/priyanair-ml",
    github_url: "github.com/priyanair-ml",
    demoVideo: "",
    projects: [
      "Production RAG stack with offline eval gates and traceable retrieval metrics.",
      "Commit history shows sustained model iteration across embedding and reranker layers.",
      "MLOps pipeline ships weekly model promotions with rollback-safe artifact versioning.",
    ],
  },
  {
    id: "C-802",
    name: "Marcus Vance",
    role: "Senior Full-Stack",
    skills: ["Next.js", "TypeScript", "Supabase"],
    integrity_score: 96,
    execution_score: 96,
    bio: "Architected production SaaS boilerplates with RLS security policies and clean TypeScript types.",
    repos_count: 9,
    audited_at: "2026-08-13T16:30:00.000Z",
    major: "B.S. Computer Science, University of Washington",
    rating: "96%",
    status: "Open for Hire",
    experienceLevel: "Senior+",
    roleType: "Engineering",
    availability: "Available Now",
    github: "github.com/marcusvance",
    github_url: "github.com/marcusvance",
    demoVideo: "",
    projects: [
      "Production SaaS boilerplate with typed App Router routes and shared domain models.",
      "Supabase RLS policies enforce tenant isolation across auth, billing, and audit tables.",
      "TypeScript strict mode across API handlers, server actions, and client hooks.",
    ],
  },
  {
    id: "C-803",
    name: "Elena Rostova",
    role: "Systems Backend",
    skills: ["Go", "Rust", "gRPC", "Distributed Systems"],
    integrity_score: 99,
    execution_score: 99,
    bio: "Engineered low-latency event-driven workers handling 20k+ req/sec with zero-allocation buffers.",
    repos_count: 10,
    audited_at: "2026-08-12T12:00:00.000Z",
    major: "M.S. Computer Science, ETH Zürich",
    rating: "99%",
    status: "Open for Hire",
    experienceLevel: "Senior+",
    roleType: "Engineering",
    availability: "Available Now",
    github: "github.com/elena-rostova",
    github_url: "github.com/elena-rostova",
    demoVideo: "",
    projects: [
      "Event-driven worker fleet sustains 20k+ req/sec with bounded latency under burst load.",
      "Zero-allocation buffer pools in Rust hot paths verified in production flamegraphs.",
      "gRPC service mesh with backpressure-aware fan-out across regional clusters.",
    ],
  },
  {
    id: "C-804",
    name: "Devon Reed",
    role: "DevOps / Platform",
    skills: ["Kubernetes", "Terraform", "AWS", "Docker"],
    integrity_score: 94,
    execution_score: 94,
    bio: "Maintains production multi-region Terraform modules and automated GitHub Actions CI/CD pipelines.",
    repos_count: 8,
    audited_at: "2026-08-11T09:15:00.000Z",
    major: "B.S. Information Systems, Purdue",
    rating: "94%",
    status: "Open for Hire",
    experienceLevel: "Mid-Level",
    roleType: "Operations",
    availability: "Available Now",
    github: "github.com/devonreed-platform",
    github_url: "github.com/devonreed-platform",
    demoVideo: "",
    projects: [
      "Multi-region Terraform modules with drift detection and staged promotion workflows.",
      "GitHub Actions pipelines gate deploys on integration tests, SBOM scans, and smoke checks.",
      "Kubernetes platform runs stateful and stateless workloads with autoscaling SLO dashboards.",
    ],
  },
  {
    id: "C-805",
    name: "Sofia Chen",
    role: "Mobile Engineer",
    skills: ["React Native", "Swift", "iOS Architecture"],
    integrity_score: 95,
    execution_score: 95,
    bio: "Built offline-first React Native architecture with smooth 60fps reanimated physics and SQLite sync.",
    repos_count: 7,
    audited_at: "2026-08-10T14:45:00.000Z",
    major: "B.S. Computer Science, UC Berkeley",
    rating: "95%",
    status: "Open for Hire",
    experienceLevel: "Mid-Level",
    roleType: "Engineering",
    availability: "Interviewing",
    github: "github.com/sofiachen-mobile",
    github_url: "github.com/sofiachen-mobile",
    demoVideo: "",
    projects: [
      "Offline-first React Native client with conflict-aware SQLite sync and background reconciliation.",
      "Reanimated physics interactions hold 60fps on mid-tier devices in production builds.",
      "Swift native modules bridge secure keychain storage and push notification extensions.",
    ],
  },
];

export function getNewestVettedCandidate(
  candidates: VettedCandidateRecord[] = VETTED_CANDIDATE_POOL
): VettedCandidateRecord {
  return [...candidates].sort(
    (a, b) =>
      new Date(b.audited_at).getTime() - new Date(a.audited_at).getTime()
  )[0];
}

export function resolveCandidateScore(candidate: {
  integrity_score?: number | null;
  execution_score?: number | null;
}): number {
  if (typeof candidate.integrity_score === "number") {
    return Math.round(candidate.integrity_score);
  }
  if (typeof candidate.execution_score === "number") {
    return Math.round(candidate.execution_score);
  }
  return 94;
}
