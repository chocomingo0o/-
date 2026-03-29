import React, { useState, useEffect } from 'react';
import { 
  Users, 
  FileText, 
  BarChart3, 
  Search, 
  LogOut, 
  ChevronRight,
  User,
  Clock,
  LayoutGrid,
  Maximize2,
  HelpCircle,
  CheckSquare,
  MessageSquare,
  ArrowLeftRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { StudentData, GradeData } from './types';
import { FileUpload } from './components/FileUpload';
import { GradeTrendChart } from './components/GradeTrendChart';
import { analyzeLifeRecord } from './services/geminiService';

export default function App() {
  const [students, setStudents] = useState<StudentData[]>([
    {
      id: "test-1",
      examNo: "A002",
      name: "김민아",
      school: "서울여자고등학교",
      graduationYear: "2024",
      grades: [
        { semester: "1-1", all: 2.79, korean: 3.0, english: 2.0, math: 3.0, social: 1.0, science: 3.0, others: 3.57 },
        { semester: "1-2", all: 3.63, korean: 3.0, english: 3.0, math: 4.0, social: 4.0, science: 2.0, others: 4.57 },
        { semester: "2-1", all: 3.78, korean: 1.0, english: 5.0, math: 3.0, social: 3.0, science: 5.0, others: 3.0 },
        { semester: "2-2", all: 4.13, korean: 2.0, english: 4.0, math: 3.0, social: 3.0, science: 5.67, others: 4.0 },
        { semester: "3-1", all: 3.05, korean: 4.0, english: 3.0, math: 3.0, social: 2.5, science: 3.0, others: 3.0 }
      ],
      subjectGrades: {},
      keywords: {
        academic: ["자기주도적 학습", "탐구역량 우수", "국어 교과 강점", "비판적 사고력"],
        career: ["미디어 콘텐츠 관심", "메타버스 융합", "디지털 리터러시", "스토리텔링"],
        community: ["리더십 발휘", "협업 및 소통", "성실한 태도", "나눔과 배려"]
      },
      details: {
        academic: "전반적으로 우수한 학업 성취도를 보이며 특히 국어와 사회 교과에서 뛰어난 역량을 나타냄. 학년이 올라갈수록 탐구 중심의 학습 태도가 돋보임.",
        nonAcademic: "메타버스 및 미디어 콘텐츠 관련 동아리 활동과 프로젝트에 적극적으로 참여하여 전공 관련 기초 역량을 탄탄히 쌓음.",
        behavior: "학급 부회장으로서 책임감 있게 역할을 수행하며, 급우들과의 원활한 소통을 통해 화합을 이끄는 리더십을 보여줌."
      }
    }
  ]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>("test-1");
  const [activeTab, setActiveTab] = useState<'academic' | 'non-academic' | 'summary'>('summary');
  const [isProcessing, setIsProcessing] = useState(false);

  const selectedStudent = students.find(s => s.id === selectedStudentId);

  const handleFileUpload = async (base64: string, mimeType: string) => {
    setIsProcessing(true);
    try {
      const data = await analyzeLifeRecord(base64, mimeType);
      const newStudent: StudentData = {
        ...data,
        id: Math.random().toString(36).substr(2, 9),
      };
      setStudents(prev => [newStudent, ...prev]);
      setSelectedStudentId(newStudent.id);
    } catch (error) {
      console.error("Analysis failed:", error);
      alert("생활기록부 분석에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      {/* Sidebar - Student List */}
      <aside className="w-72 bg-white border-r border-slate-200 flex flex-col shrink-0">
        <div className="p-4 border-bottom border-slate-200 bg-primary text-white">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-white/20 rounded flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <h1 className="font-bold text-lg tracking-tight">평가관리시스템</h1>
          </div>
          <div className="space-y-1">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-white/60">평가 현황</h2>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-white/10 p-2 rounded">
                <p className="text-white/60 text-[10px]">배정인원</p>
                <p className="font-bold">{students.length}</p>
              </div>
              <div className="bg-white/10 p-2 rounded">
                <p className="text-white/60 text-[10px]">진행률</p>
                <p className="font-bold">0%</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="지원자 검색..." 
              className="w-full pl-9 pr-4 py-2 bg-slate-100 border-none rounded-md text-sm focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr className="text-slate-500 border-b border-slate-200">
                <th className="px-4 py-2 text-left font-medium">순번</th>
                <th className="px-4 py-2 text-left font-medium">가번호</th>
                <th className="px-4 py-2 text-left font-medium">평가</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student, idx) => (
                <tr 
                  key={student.id}
                  onClick={() => setSelectedStudentId(student.id)}
                  className={cn(
                    "border-b border-slate-100 cursor-pointer transition-colors",
                    selectedStudentId === student.id ? "bg-primary/5 border-l-4 border-l-primary" : "hover:bg-slate-50"
                  )}
                >
                  <td className="px-4 py-3 text-slate-500">{idx + 1}</td>
                  <td className="px-4 py-3 font-medium">{student.examNo}</td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">대기</span>
                  </td>
                </tr>
              ))}
              {students.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-12 text-center text-slate-400 italic">
                    업로드된 학생이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="w-2 h-2 rounded-full bg-accent-green"></span>
              온라인
            </div>
            <div className="h-4 w-px bg-slate-200"></div>
            <div className="flex items-center gap-4">
              <button className="p-2 hover:bg-slate-100 rounded-md transition-colors text-slate-500" title="확대">
                <Maximize2 className="w-4 h-4" />
              </button>
              <button className="p-2 hover:bg-slate-100 rounded-md transition-colors text-slate-500" title="도움말">
                <HelpCircle className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                <User className="w-4 h-4 text-slate-600" />
              </div>
              <span className="font-medium">입학사정관</span>
              <span className="text-slate-400">님</span>
            </div>
            <button className="p-2 hover:bg-red-50 text-red-500 rounded-md transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50">
            {selectedStudent ? (
              <>
                {/* Student Info Banner */}
                <div className="bg-white border-b border-slate-200 p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex gap-8">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">가번호</p>
                        <p className="text-xl font-bold text-primary">{selectedStudent.examNo}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">성명</p>
                        <p className="text-xl font-bold text-slate-900">{selectedStudent.name}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">고교명</p>
                        <p className="text-xl font-bold text-slate-900">{selectedStudent.school}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button className="px-4 py-2 bg-white border border-slate-200 rounded-md text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-2">
                        <ArrowLeftRight className="w-4 h-4" />
                        대상자비교
                      </button>
                      <button className="px-4 py-2 bg-white border border-slate-200 rounded-md text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-2">
                        <LayoutGrid className="w-4 h-4" />
                        듀얼창 ON
                      </button>
                    </div>
                  </div>
                </div>

                {/* Tabs */}
                <div className="px-6 pt-4">
                  <div className="flex border-b border-slate-200 gap-8">
                    <button 
                      onClick={() => setActiveTab('summary')}
                      className={cn(
                        "pb-3 text-sm font-medium transition-all relative",
                        activeTab === 'summary' ? "text-primary" : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      지원자 요약정보
                      {activeTab === 'summary' && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
                    </button>
                    <button 
                      onClick={() => setActiveTab('academic')}
                      className={cn(
                        "pb-3 text-sm font-medium transition-all relative",
                        activeTab === 'academic' ? "text-primary" : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      학생부(교과)
                      {activeTab === 'academic' && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
                    </button>
                    <button 
                      onClick={() => setActiveTab('non-academic')}
                      className={cn(
                        "pb-3 text-sm font-medium transition-all relative",
                        activeTab === 'non-academic' ? "text-primary" : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      학생부(교과 외)
                      {activeTab === 'non-academic' && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
                    </button>
                  </div>
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto p-6">
                  <AnimatePresence mode="wait">
                    {activeTab === 'summary' && (
                      <motion.div 
                        key="summary"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-6"
                      >
                        <div className="grid grid-cols-3 gap-6">
                          <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                            <h3 className="text-sm font-bold text-primary mb-4 flex items-center gap-2">
                              <div className="w-1.5 h-4 bg-primary rounded-full"></div>
                              학업역량 핵심키워드
                            </h3>
                            <div className="flex flex-wrap gap-2">
                              {selectedStudent.keywords.academic.map((kw, i) => (
                                <span key={i} className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-medium">
                                  {kw}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                            <h3 className="text-sm font-bold text-primary mb-4 flex items-center gap-2">
                              <div className="w-1.5 h-4 bg-primary rounded-full"></div>
                              진로역량 핵심키워드
                            </h3>
                            <div className="flex flex-wrap gap-2">
                              {selectedStudent.keywords.career.map((kw, i) => (
                                <span key={i} className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-medium">
                                  {kw}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                            <h3 className="text-sm font-bold text-primary mb-4 flex items-center gap-2">
                              <div className="w-1.5 h-4 bg-primary rounded-full"></div>
                              공동체역량 핵심키워드
                            </h3>
                            <div className="flex flex-wrap gap-2">
                              {selectedStudent.keywords.community.map((kw, i) => (
                                <span key={i} className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-medium">
                                  {kw}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                          <h3 className="text-sm font-bold text-primary mb-4 flex items-center gap-2">
                            <div className="w-1.5 h-4 bg-primary rounded-full"></div>
                            종합 의견 요약
                          </h3>
                          <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                            {selectedStudent.details.behavior}
                          </p>
                        </div>
                      </motion.div>
                    )}

                    {activeTab === 'academic' && (
                      <motion.div 
                        key="academic"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-8"
                      >
                        <section>
                          <h3 className="text-base font-bold text-slate-900 mb-4">교과별 추이도</h3>
                          <GradeTrendChart data={selectedStudent.grades} />
                        </section>

                        <section>
                          <h3 className="text-base font-bold text-slate-900 mb-4">성적현황[교과]</h3>
                          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                            <table className="w-full text-sm">
                              <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                  <th className="px-4 py-3 text-left font-bold text-slate-700">교과구분</th>
                                  <th className="px-4 py-3 text-center font-bold text-slate-700">전체평균</th>
                                  <th className="px-4 py-3 text-center font-bold text-slate-700">1-1</th>
                                  <th className="px-4 py-3 text-center font-bold text-slate-700">1-2</th>
                                  <th className="px-4 py-3 text-center font-bold text-slate-700">2-1</th>
                                  <th className="px-4 py-3 text-center font-bold text-slate-700">2-2</th>
                                  <th className="px-4 py-3 text-center font-bold text-slate-700">3-1</th>
                                </tr>
                              </thead>
                              <tbody>
                                {['전과목', '국어', '영어', '수학', '사회', '과학'].map((subject) => {
                                  const key = subject === '전과목' ? 'all' : 
                                              subject === '국어' ? 'korean' :
                                              subject === '영어' ? 'english' :
                                              subject === '수학' ? 'math' :
                                              subject === '사회' ? 'social' : 'science';
                                  
                                  const avg = (selectedStudent.grades.reduce((acc, g) => acc + (g[key as keyof GradeData] as number || 0), 0) / 5).toFixed(2);

                                  return (
                                    <tr key={subject} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                      <td className="px-4 py-3 font-medium text-slate-900">{subject}</td>
                                      <td className="px-4 py-3 text-center font-bold text-secondary">{avg}</td>
                                      {selectedStudent.grades.map((g, i) => (
                                        <td key={i} className="px-4 py-3 text-center text-slate-600">
                                          {g[key as keyof GradeData] || '-'}
                                        </td>
                                      ))}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </section>
                      </motion.div>
                    )}

                    {activeTab === 'non-academic' && (
                      <motion.div 
                        key="non-academic"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-6"
                      >
                        <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                          <h3 className="text-sm font-bold text-primary mb-4 flex items-center gap-2">
                            <div className="w-1.5 h-4 bg-primary rounded-full"></div>
                            창의적 체험활동 요약
                          </h3>
                          <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                            {selectedStudent.details.nonAcademic}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center p-12">
                <div className="max-w-md w-full">
                  <FileUpload onUpload={handleFileUpload} isProcessing={isProcessing} />
                </div>
              </div>
            )}
          </div>

          {/* Right Sidebar - Evaluation Form */}
          <aside className="w-80 bg-white border-l border-slate-200 flex flex-col shrink-0">
            <div className="p-4 border-b border-slate-200 bg-slate-50">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-primary" />
                평가 입력
              </h3>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Academic Competency */}
              <div className="space-y-3">
                <label className="text-sm font-bold text-slate-700 flex items-center justify-between">
                  학업역량
                  <span className="text-[10px] font-normal text-slate-400">40%</span>
                </label>
                <div className="grid grid-cols-4 gap-1">
                  {['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C', 'D'].map(grade => (
                    <button 
                      key={grade}
                      className="py-2 text-xs border border-slate-200 rounded hover:bg-primary hover:text-white hover:border-primary transition-all"
                    >
                      {grade}
                    </button>
                  ))}
                </div>
              </div>

              {/* Career Competency */}
              <div className="space-y-3">
                <label className="text-sm font-bold text-slate-700 flex items-center justify-between">
                  진로역량
                  <span className="text-[10px] font-normal text-slate-400">35%</span>
                </label>
                <div className="grid grid-cols-4 gap-1">
                  {['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C', 'D'].map(grade => (
                    <button 
                      key={grade}
                      className="py-2 text-xs border border-slate-200 rounded hover:bg-primary hover:text-white hover:border-primary transition-all"
                    >
                      {grade}
                    </button>
                  ))}
                </div>
              </div>

              {/* Community Competency */}
              <div className="space-y-3">
                <label className="text-sm font-bold text-slate-700 flex items-center justify-between">
                  공동체역량
                  <span className="text-[10px] font-normal text-slate-400">25%</span>
                </label>
                <div className="grid grid-cols-4 gap-1">
                  {['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C', 'D'].map(grade => (
                    <button 
                      key={grade}
                      className="py-2 text-xs border border-slate-200 rounded hover:bg-primary hover:text-white hover:border-primary transition-all"
                    >
                      {grade}
                    </button>
                  ))}
                </div>
              </div>

              {/* Total Comment */}
              <div className="space-y-3">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-slate-400" />
                  서류평가 총평
                </label>
                <textarea 
                  rows={6}
                  placeholder="평가 의견을 입력하세요..."
                  className="w-full p-3 text-sm border border-slate-200 rounded-md focus:ring-2 focus:ring-primary/20 outline-none resize-none"
                ></textarea>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200">
              <button className="w-full py-3 bg-primary text-white rounded-md font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20">
                최종완료
              </button>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
