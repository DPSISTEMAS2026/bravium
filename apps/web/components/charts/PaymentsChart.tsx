'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const data = [
    { name: 'Ene', Pagado: 4000000, Pendiente: 2400000 },
    { name: 'Feb', Pagado: 3000000, Pendiente: 1398000 },
    { name: 'Mar', Pagado: 2000000, Pendiente: 9800000 },
    { name: 'Abr', Pagado: 2780000, Pendiente: 3908000 },
    { name: 'May', Pagado: 1890000, Pendiente: 4800000 },
    { name: 'Jun', Pagado: 2390000, Pendiente: 3800000 },
];

export function PaymentsChart() {
    return (
        <div className="h-100 w-100" style={{ minHeight: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart
                    data={data}
                    margin={{
                        top: 20,
                        right: 30,
                        left: 20,
                        bottom: 5,
                    }}
                >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e9ecef" />
                    <XAxis dataKey="name" tick={{ fill: '#6c757d' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#6c757d' }} axisLine={false} tickLine={false} tickFormatter={(value) => `$${value / 1000000}M`} />
                    <Tooltip
                        cursor={{ fill: '#f8f9fa' }}
                        formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
                    />
                    <Legend />
                    <Bar dataKey="Pagado" fill="#0d6efd" radius={[4, 4, 0, 0]} maxBarSize={50} />
                    <Bar dataKey="Pendiente" fill="#adb5bd" radius={[4, 4, 0, 0]} maxBarSize={50} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
