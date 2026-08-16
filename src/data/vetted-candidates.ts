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
    skills: ["PyTorch", "LLM Fine-Tuning", "RAG Pipelines", "MLOps"],
    integrity_score: 96,
    execution_score: 94,
    bio: "Shipped production RAG systems with traceable eval harnesses — commit history shows sustained model iteration, not resume padding.",
    repos_count: 11,
    audited_at: "2026-08-14T18:00:00.000Z",
    major: "M.S. Machine Learning, Georgia Tech",
    rating: "96%",
    status: "Open for Hire",
    experienceLevel: "Senior+",
    roleType: "Engineering",
    availability: "Available Now",
    github: "github.com/priyanair-ml",
    github_url: "github.com/priyanair-ml",
    demoVideo: "",
    projects: [
      "Fine-tuned an open-weight LLM for domain Q&A with offline eval gates.",
      "Built a RAG ingestion pipeline processing 2M+ documents with observability.",
    ],
  },
  {
    id: "C-802",
    name: "Marcus Volkov",
    role: "Rust Systems Developer",
    skills: ["Rust", "Tokio", "WASM", "Distributed Systems"],
    integrity_score: 93,
    execution_score: 91,
    bio: "Systems engineer with two years of daily Rust commits across async services and low-latency networking crates.",
    repos_count: 9,
    audited_at: "2026-08-13T16:30:00.000Z",
    major: "B.S. Computer Engineering, UT Austin",
    rating: "93%",
    status: "Open for Hire",
    experienceLevel: "Mid-Level",
    roleType: "Engineering",
    availability: "Available Now",
    github: "github.com/mvolkov-rs",
    github_url: "github.com/mvolkov-rs",
    demoVideo: "",
    projects: [
      "Authored a Tokio-based event router handling 40k msgs/sec in production.",
      "Contributed WASM modules to a browser-side compute sandbox.",
    ],
  },
  {
    id: "C-803",
    name: "Jordan Lee",
    role: "Next.js Architect",
    skills: ["Next.js", "TypeScript", "PostgreSQL", "Edge Runtime"],
    integrity_score: 95,
    execution_score: 95,
    bio: "Full-stack architect with verifiable App Router migrations and production observability baked into every repo.",
    repos_count: 8,
    audited_at: "2026-08-12T12:00:00.000Z",
    major: "B.S. Computer Science, Stanford",
    rating: "95%",
    status: "Open for Hire",
    experienceLevel: "Senior+",
    roleType: "Engineering",
    availability: "Available Now",
    github: "github.com/jordanlee",
    github_url: "github.com/jordanlee",
    demoVideo: "youtube.com/watch?v=jordan-demo",
    projects: [
      "Led a Next.js 15 migration for a SaaS dashboard serving 500+ paying customers.",
      "Designed edge-cache strategy cutting TTFB by 38% on authenticated routes.",
    ],
  },
  {
    id: "C-804",
    name: "Dr. Elena Vasquez",
    role: "ML PhD Researcher",
    skills: ["Research ML", "Python", "JAX", "Paper Reproduction"],
    integrity_score: 97,
    execution_score: 92,
    bio: "PhD researcher with public reproduction repos and peer-reviewed artifacts — timeline and citations verified against ORCID.",
    repos_count: 7,
    audited_at: "2026-08-11T09:15:00.000Z",
    major: "Ph.D. Computer Science, MIT",
    rating: "97%",
    status: "Open for Hire",
    experienceLevel: "Senior+",
    roleType: "Engineering",
    availability: "Interviewing",
    github: "github.com/elena-vasquez-ml",
    github_url: "github.com/elena-vasquez-ml",
    demoVideo: "",
    projects: [
      "Open-sourced reproduction code for a NeurIPS spotlight paper.",
      "Published benchmark suite adopted by two university labs.",
    ],
  },
  {
    id: "C-805",
    name: "Sofia Kim",
    role: "Product Designer",
    skills: ["Figma", "Design Systems", "UX Research", "Prototyping"],
    integrity_score: 91,
    execution_score: 90,
    bio: "Product designer with shipped case studies, Figma libraries, and user-research artifacts tied to measurable conversion lifts.",
    repos_count: 6,
    audited_at: "2026-08-10T14:45:00.000Z",
    major: "B.F.A. Interaction Design, RISD",
    rating: "91%",
    status: "Open for Hire",
    experienceLevel: "Junior / Entry-Level",
    roleType: "Design",
    availability: "Available Now",
    github: "figma.com/@sofiakim",
    linkedin_url: "linkedin.com/in/sofiakim",
    demoVideo: "",
    projects: [
      "Redesigned onboarding flow lifting activation by 22% in A/B testing.",
      "Built a component library used across three product squads.",
    ],
  },
  {
    id: "C-806",
    name: "Maya Chen",
    role: "Growth Video Producer",
    skills: ["Premiere Pro", "After Effects", "Hook Writing", "Paid Social"],
    integrity_score: 89,
    execution_score: 88,
    bio: "Growth producer with portfolio reels, retention analytics, and platform-native edits verified across client campaigns.",
    repos_count: 5,
    audited_at: "2026-08-09T11:20:00.000Z",
    major: "Self-Taught (Portfolio Verified)",
    rating: "89%",
    status: "Open for Hire",
    experienceLevel: "Student / Intern",
    roleType: "Marketing",
    availability: "Available Now",
    github: "vimeo.com/mayachen",
    github_url: "vimeo.com/mayachen",
    demoVideo: "youtube.com/watch?v=maya-demo",
    projects: [
      "Produced 200+ short-form ads averaging 1M+ views per month.",
      "Scaled a client's TikTok channel from 0 to 80K followers in four months.",
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
