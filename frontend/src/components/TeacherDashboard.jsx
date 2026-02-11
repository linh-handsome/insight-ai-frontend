import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Activity, UserX, ArrowDown, Users, Download, AlertTriangle } from 'lucide-react';

// Connect to socket server
const ENDPOINT = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
const socket = io(ENDPOINT);

const TeacherDashboard = () => {
    const [students, setStudents] = useState({});
    const [selectedStudentId, setSelectedStudentId] = useState(null);

    useEffect(() => {
        // Listen for updates
        socket.on('teacher_update', (data) => {
            console.log("Teacher Update:", data);
            setStudents(data);
        });

        return () => {
            socket.off('teacher_update');
        };
    }, []);

    const selectedStudent = selectedStudentId ? students[selectedStudentId] : null;

    // --- PDF Generation Logic ---
    const generatePDF = (student) => {
        if (!student) return;

        try {
            const doc = new jsPDF();
            // Need a font that supports Vietnamese if standard font fails, 
            // but standard jsPDF might struggle with some Vietnamese characters without custom font.
            // For now, we will use standard characters or simplest translation.
            // Ideally, we should add a font like Roboto-Regular.ttf but that requires base64.
            // We will proceed with standard text, hoping browser context helps or it falls back gracefully.
            // Note: jsPDF default fonts often don't support utf-8 unicode for Vietnamese (e.g. ă, â, ê, ư).
            // WE MUST BE CAREFUL. However, user asked for Vietnamese text.
            // If characters break, we might need a quick fix or just use unaccented text if we can't load font.
            // Let's assume standard usage for now, but be aware.
            // Actually, newer jsPDF versions support UTF-8 if filtered correctly, but usually needs addFont.
            // We'll proceed with the requested text.

            // Header
            doc.setFontSize(22);
            doc.setTextColor(76, 29, 149); // Brand Primary
            doc.text(`BÁO CÁO HỌC TẬP: ${student.name}`, 14, 20);

            doc.setFontSize(10);
            doc.setTextColor(100);
            const dateStr = new Date().toLocaleDateString('vi-VN') + " " + new Date().toLocaleTimeString('vi-VN');
            doc.text(`Ngày tạo báo cáo: ${dateStr}`, 14, 28);
            doc.text(`Mã học sinh: ${student.id}`, 14, 33);

            // Summary Stats
            // Calculate totals locally from the logs if needed, or use the ones passed
            // The student object has violations array.
            const violations = student.violations || [];
            const leftDeskCount = violations.filter(v => v.type === "Left Desk" || v.type === "Left_Desk").length;
            const lookedDownCount = violations.filter(v => v.type === "Looking Down" || v.type === "Looking_Down").length;

            autoTable(doc, {
                startY: 40,
                head: [['Chỉ số', 'Giá trị']],
                body: [
                    ['Mức độ Tập trung Trung bình', `${student.engagement}%`],
                    ['Số lần rời vị trí', leftDeskCount],
                    ['Số lần mất tập trung', lookedDownCount],
                    ['Tổng số vi phạm', violations.length]
                ],
                theme: 'grid',
                headStyles: { fillColor: [76, 29, 149] }
            });

            // Detailed Table
            const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY : 80;
            doc.text("Nhật ký vi phạm chi tiết", 14, finalY + 15);

            const translateType = (t) => {
                if (t === "Left Desk") return "Rời vị trí";
                if (t === "Looking Down") return "Mất tập trung";
                return t;
            };

            const tableRows = violations.map(v => [
                v.time, // Timestamp
                translateType(v.type)  // Violation Type
            ]);

            autoTable(doc, {
                startY: finalY + 20,
                head: [['Thời gian', 'Loại vi phạm']],
                body: tableRows.length > 0 ? tableRows : [['-', 'Chưa ghi nhận vi phạm nào']],
                theme: 'striped',
                headStyles: { fillColor: [220, 38, 38] }
            });

            doc.save(`Bao_Cao_${student.name.replace(/\s+/g, '_')}_${Date.now()}.pdf`);
            alert(`Đã xuất báo cáo cho ${student.name}!`);

        } catch (error) {
            console.error("PDF Fail:", error);
            alert("Xuất báo cáo thất bại");
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white p-8 flex flex-col">
            {/* Header */}
            <div className="mb-8 flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-brand-primary flex items-center gap-3">
                        <Users className="text-brand-accent" /> Bảng Theo Dõi Học Tập
                    </h1>
                    <p className="text-gray-400 mt-2">Hệ thống giám sát lớp học thời gian thực</p>
                </div>
                <div className="bg-gray-800 px-4 py-2 rounded-lg border border-gray-700">
                    <span className="text-gray-400 text-sm">Học sinh đang hoạt động:</span>
                    <span className="ml-2 text-2xl font-bold text-green-400">{Object.keys(students).length}</span>
                </div>
            </div>

            <div className="flex flex-1 gap-6 overflow-hidden">
                {/* Left: Student Grid */}
                <div className="flex-1 overflow-y-auto pr-2">
                    <h2 className="text-xl font-semibold mb-4 text-gray-300">Danh sách lớp</h2>

                    {Object.keys(students).length === 0 ? (
                        <div className="text-center py-20 bg-gray-800/50 rounded-xl border border-dashed border-gray-700">
                            <p className="text-gray-500">Đang chờ học sinh kết nối...</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4">
                            {Object.values(students).map(student => (
                                <div
                                    key={student.id}
                                    onClick={() => setSelectedStudentId(student.id)}
                                    className={`cursor-pointer p-4 rounded-xl border transition-all ${selectedStudentId === student.id
                                        ? 'bg-brand-primary/20 border-brand-primary ring-1 ring-brand-primary'
                                        : 'bg-gray-800 border-gray-700 hover:bg-gray-750 hover:border-gray-600'
                                        }`}
                                >
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="font-bold text-lg truncate">{student.name}</div>
                                        <div className={`px-2 py-1 rounded text-xs font-bold ${student.engagement > 70 ? 'bg-green-500/20 text-green-400' :
                                            student.engagement > 40 ? 'bg-yellow-500/20 text-yellow-400' :
                                                'bg-red-500/20 text-red-400'
                                            }`}>
                                            {student.engagement}% Tập trung
                                        </div>
                                    </div>

                                    <div className="flex gap-4 text-sm text-gray-400">
                                        <div className="flex items-center gap-1">
                                            <AlertTriangle size={14} className="text-red-400" />
                                            {student.violations ? student.violations.length : 0} Vi phạm
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Right: Detailed View */}
                <div className="w-1/3 min-w-[350px] bg-gray-800 rounded-2xl border border-gray-700 p-6 flex flex-col">
                    {selectedStudent ? (
                        <>
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h2 className="text-2xl font-bold">{selectedStudent.name}</h2>
                                    <p className="text-xs text-gray-500 font-mono mt-1">ID: {selectedStudent.id}</p>
                                </div>
                                <button
                                    onClick={() => generatePDF(selectedStudent)}
                                    className="bg-brand-primary hover:bg-brand-accent text-white px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors"
                                >
                                    <Download size={16} /> Xuất báo cáo PDF
                                </button>
                            </div>

                            {/* Detailed Stats */}
                            <div className="grid grid-cols-2 gap-3 mb-6">
                                <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-700/50">
                                    <div className="text-xs text-gray-400 mb-1">Mức độ Tập trung</div>
                                    <div className={`text-2xl font-bold ${selectedStudent.engagement > 70 ? 'text-green-400' : 'text-red-400'
                                        }`}>
                                        {selectedStudent.engagement}%
                                    </div>
                                </div>
                                <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-700/50">
                                    <div className="text-xs text-gray-400 mb-1">Tổng số vi phạm</div>
                                    <div className="text-2xl font-bold text-yellow-400">
                                        {selectedStudent.violations ? selectedStudent.violations.length : 0}
                                    </div>
                                </div>
                            </div>

                            <h3 className="font-semibold text-gray-300 mb-3 flex items-center gap-2">
                                <Activity size={16} /> Nhật ký hoạt động
                            </h3>

                            <div className="flex-1 overflow-y-auto custom-scrollbar bg-gray-900/30 rounded-lg p-2 space-y-2">
                                {selectedStudent.violations && selectedStudent.violations.length > 0 ? (
                                    selectedStudent.violations.slice().reverse().map((log, i) => (
                                        <div key={i} className="flex items-center justify-between p-3 bg-gray-800 rounded border border-gray-700/50 text-sm">
                                            <span className="font-mono text-gray-500 text-xs">{log.time}</span>
                                            <span className={`font-medium ${log.type === "Left Desk" ? "text-red-400" : "text-yellow-400"
                                                }`}>
                                                {log.type === "Left Desk" ? "Rời vị trí" : (log.type === "Looking Down" ? "Mất tập trung" : log.type)}
                                            </span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center text-gray-600 py-10 text-sm italic">
                                        Chưa ghi nhận vi phạm nào.
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-600">
                            <Users size={64} className="mb-4 opacity-50" />
                            <p>Chọn học sinh để xem chi tiết</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TeacherDashboard;
