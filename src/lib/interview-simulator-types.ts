export type InterviewSimulatorRequestBody = {
  targetJobTitle?: string;
  coreTechStack?: string;
  interviewRound?: string;
  companyType?: string;
};

export type InterviewQuestion = {
  question: string;
  idealAnswer: string;
  talkingPoints: string[];
};

export type InterviewSimulatorResult = {
  questions: InterviewQuestion[];
  technicalTrap: string;
  closingQuestion: string;
};
