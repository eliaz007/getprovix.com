export type PitchStudioRequestBody = {
  targetCompany?: string;
  targetContactRole?: string;
  roleApplyingFor?: string;
  coreValueProp?: string;
  tone?: string;
};

export type PitchTemplate = {
  title: string;
  channel: string;
  body: string;
  copyTip: string;
};

export type PitchStudioResult = {
  pitches: PitchTemplate[];
};
