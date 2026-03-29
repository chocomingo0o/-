export interface GradeData {
  semester: string;
  all: number | null;
  korean: number | null;
  english: number | null;
  math: number | null;
  social: number | null;
  science: number | null;
  others: number | null;
}

export interface SubjectGrade {
  subject: string;
  grade: string;
  unit: number;
  score: number;
  average: number;
  stdDev: number;
  students: number;
}

export interface CompetencyKeywords {
  academic: string[];
  career: string[];
  community: string[];
}

export interface StudentData {
  id: string;
  examNo: string;
  name: string;
  school: string;
  graduationYear: string;
  grades: GradeData[];
  subjectGrades: {
    [key: string]: SubjectGrade[];
  };
  keywords: CompetencyKeywords;
  details: {
    academic: string;
    nonAcademic: string;
    behavior: string;
  };
}
