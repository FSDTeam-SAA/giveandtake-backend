// Values remain stable so changing a label never invalidates saved resumes.
export const qualificationDefaults = [
  ["BSc", "B.Sc"], ["B.Tech", "B.Tech"], ["B.A", "B.A"],
  ["B.Ed", "B.Ed"], ["B.Eng", "B.Eng"], ["LLB", "LL.B"],
  ["LLM", "LL.M"], ["M.B.A", "M.B.A"], ["MSc", "M.Sc"],
  ["M.Phil", "M.Phil"], ["M.Eng", "M.Eng"], ["Ph.D", "Ph.D"],
  ["High School", "High School"], ["College", "College"],
  ["Sixth Form", "Sixth Form"], ["ONC", "ONC"], ["OND", "OND"],
  ["HNC", "HNC"], ["HND", "HND"],
];

export const qualificationKey = (label: string) =>
  label.replace(/[.\s]/g, "").toLowerCase();
