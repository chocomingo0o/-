import { GoogleGenAI, Type } from "@google/genai";
import { StudentData } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function analyzeLifeRecord(fileBase64: string, mimeType: string): Promise<StudentData> {
  const model = ai.models.generateContent({
    model: "gemini-2.0-flash-exp",
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              data: fileBase64,
              mimeType: mimeType,
            },
          },
          {
            text: `당신은 대학 입학사정관입니다. 업로드된 학생 생활기록부를 분석하여 다음 JSON 형식으로 데이터를 추출해주세요.
            
            추출 규칙:
            1. '교과학습발달상황' 섹션에서 학기별/교과별 등급을 정확히 추출하여 grades 배열을 채워주세요. 
               - 학기: 1-1, 1-2, 2-1, 2-2, 3-1
               - 교과: 국어, 영어, 수학, 사회, 과학, 전과목(평균)
            2. 핵심 키워드는 학생의 강점이 잘 드러나는 단어 위주로 학업역량, 진로역량, 공동체역량별로 5-8개씩 발췌해주세요.
            3. 상세 내용(details)은 각 영역별 주요 특징을 요약해주세요.
            4. 가번호(examNo)는 'A'로 시작하는 3자리 숫자(예: A001)로 생성해주세요.
            
            응답 스키마:
            {
              "examNo": "가번호",
              "name": "이름",
              "school": "고등학교명",
              "graduationYear": "졸업년도",
              "grades": [
                { "semester": "1-1", "all": 3.0, "korean": 3.0, "english": 2.0, "math": 3.0, "social": 1.0, "science": 3.0, "others": 3.5 },
                { "semester": "1-2", "all": 3.2, "korean": 3.0, "english": 3.0, "math": 4.0, "social": 4.0, "science": 2.0, "others": 4.5 },
                { "semester": "2-1", "all": 3.5, "korean": 1.0, "english": 5.0, "math": 3.0, "social": 3.0, "science": 5.0, "others": 3.0 },
                { "semester": "2-2", "all": 3.8, "korean": 2.0, "english": 4.0, "math": 3.0, "social": 3.0, "science": 5.6, "others": 4.0 },
                { "semester": "3-1", "all": 3.1, "korean": 4.0, "english": 3.0, "math": 3.0, "social": 2.5, "science": 3.0, "others": 3.0 }
              ],
              "keywords": {
                "academic": ["자기주도적", "탐구력 우수"],
                "career": ["전공적합성", "진로탐색"],
                "community": ["리더십", "협업능력"]
              },
              "details": {
                "academic": "학업 관련 요약",
                "nonAcademic": "비교과 관련 요약",
                "behavior": "행동특성 요약"
              }
            }`,
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          examNo: { type: Type.STRING },
          name: { type: Type.STRING },
          school: { type: Type.STRING },
          graduationYear: { type: Type.STRING },
          grades: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                semester: { type: Type.STRING },
                all: { type: Type.NUMBER },
                korean: { type: Type.NUMBER },
                english: { type: Type.NUMBER },
                math: { type: Type.NUMBER },
                social: { type: Type.NUMBER },
                science: { type: Type.NUMBER },
                others: { type: Type.NUMBER },
              }
            }
          },
          keywords: {
            type: Type.OBJECT,
            properties: {
              academic: { type: Type.ARRAY, items: { type: Type.STRING } },
              career: { type: Type.ARRAY, items: { type: Type.STRING } },
              community: { type: Type.ARRAY, items: { type: Type.STRING } }
            }
          },
          details: {
            type: Type.OBJECT,
            properties: {
              academic: { type: Type.STRING },
              nonAcademic: { type: Type.STRING },
              behavior: { type: Type.STRING }
            }
          }
        }
      }
    }
  });

  const response = await model;
  return JSON.parse(response.text || "{}");
}
