import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { GradeData } from '../types';

interface GradeTrendChartProps {
  data: GradeData[];
}

export const GradeTrendChart: React.FC<GradeTrendChartProps> = ({ data }) => {
  return (
    <div className="w-full h-[300px] bg-white p-4 rounded-sm border border-slate-200">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis 
            dataKey="semester" 
            axisLine={{ stroke: '#cbd5e1' }}
            tickLine={false}
            tick={{ fontSize: 12, fill: '#64748b' }}
          />
          <YAxis 
            reversed 
            domain={[1, 9]} 
            ticks={[1, 2, 3, 4, 5, 6, 7, 8, 9]}
            axisLine={{ stroke: '#cbd5e1' }}
            tickLine={false}
            tick={{ fontSize: 12, fill: '#64748b' }}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '4px' }}
          />
          <Legend iconType="circle" wrapperStyle={{ paddingTop: '10px', fontSize: '12px' }} />
          <Line type="monotone" dataKey="all" name="전과목" stroke="#1a2a7a" strokeWidth={2} dot={{ r: 4, fill: '#1a2a7a' }} activeDot={{ r: 6 }} />
          <Line type="monotone" dataKey="korean" name="국어" stroke="#ef4444" strokeWidth={1} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="math" name="수학" stroke="#3b82f6" strokeWidth={1} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="english" name="영어" stroke="#10b981" strokeWidth={1} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
