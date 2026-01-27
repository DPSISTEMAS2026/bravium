
"use client";

import { useState } from 'react';

export default function CartolasIngestionPage() {
    const [file, setFile] = useState<File | null>(null);
    const [bankName, setBankName] = useState('Banco de Chile');
    const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
    const [result, setResult] = useState<any>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const convertToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                // Remove data URL prefix (e.g. "data:application/vnd.ms-excel;base64,")
                const result = reader.result as string;
                const base64 = result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = error => reject(error);
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) return;

        setStatus('uploading');
        setResult(null);

        try {
            const base64Content = await convertToBase64(file);

            const payload = {
                fileContentBase64: base64Content,
                metadata: {
                    filename: file.name,
                    bankName: bankName
                }
            };

            const res = await fetch('http://localhost:3001/ingestion/cartolas/drive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (res.ok && data.status === 'success') {
                setStatus('success');
                setResult(data.data);
            } else {
                throw new Error(data.message || 'Error desconocido');
            }

        } catch (error: any) {
            console.error(error);
            setStatus('error');
            setResult({ message: error.message });
        }
    };

    return (
        <div className="p-6 max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Carga Manual de Cartolas</h1>

            <div className="bg-white shadow rounded-lg p-6 border border-gray-100">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Banco</label>
                        <select
                            value={bankName}
                            onChange={(e) => setBankName(e.target.value)}
                            className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm border"
                        >
                            <option value="Banco de Chile">Banco de Chile</option>
                            <option value="Santander">Santander</option>
                            <option value="Bci">Bci</option>
                            <option value="Scotiabank">Scotiabank</option>
                            <option value="Itau">Itaú</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700">Archivo Cartola (Excel)</label>
                        <div className="mt-1 flex justify-center rounded-md border-2 border-dashed border-gray-300 px-6 pt-5 pb-6">
                            <div className="space-y-1 text-center">
                                <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                <div className="flex text-sm text-gray-600">
                                    <label htmlFor="file-upload" className="relative cursor-pointer rounded-md bg-white font-medium text-indigo-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-indigo-500 focus-within:ring-offset-2 hover:text-indigo-500">
                                        <span>Subir un archivo</span>
                                        <input id="file-upload" name="file-upload" type="file" className="sr-only" onChange={handleFileChange} accept=".xlsx, .xls" />
                                    </label>
                                    <p className="pl-1">o arrastrar y soltar</p>
                                </div>
                                <p className="text-xs text-gray-500">XLSX hasta 10MB</p>
                            </div>
                        </div>
                        {file && (
                            <p className="mt-2 text-sm text-green-600 font-medium">Archivo seleccionado: {file.name}</p>
                        )}
                    </div>

                    <div>
                        <button
                            type="submit"
                            disabled={!file || status === 'uploading'}
                            className={`w-full flex justify-center rounded-md border border-transparent py-2 px-4 text-sm font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${!file || status === 'uploading' ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'
                                }`}
                        >
                            {status === 'uploading' ? 'Procesando...' : 'Cargar Cartola'}
                        </button>
                    </div>
                </form>

                {status === 'success' && result && (
                    <div className="mt-6 bg-green-50 border border-green-200 rounded-md p-4">
                        <div className="flex">
                            <div className="flex-shrink-0">
                                <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div className="ml-3">
                                <h3 className="text-sm font-medium text-green-800">Carga Exitosa</h3>
                                <div className="mt-2 text-sm text-green-700">
                                    <p>Se procesaron correctamente {result.processed} transacciones para la cuenta asociada a {result.bankAccount}.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {status === 'error' && result && (
                    <div className="mt-6 bg-red-50 border border-red-200 rounded-md p-4">
                        <div className="flex">
                            <div className="flex-shrink-0">
                                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                </svg>
                            </div>
                            <div className="ml-3">
                                <h3 className="text-sm font-medium text-red-800">Error en la carga</h3>
                                <div className="mt-2 text-sm text-red-700">
                                    <p>{result.message}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
