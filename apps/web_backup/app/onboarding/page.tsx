import { useState } from 'react';
import { OnboardingProgress } from '../../components/onboarding/onboarding-progress';

// Step Components (Simplified for Architecture demo)
function StepOrganization({ onNext }: any) {
    return (
        <div className="bg-white px-4 py-5 shadow sm:rounded-lg sm:p-6">
            <div className="md:grid md:grid-cols-3 md:gap-6">
                <div className="md:col-span-1">
                    <h3 className="text-lg font-medium leading-6 text-gray-900">Tu Empresa</h3>
                    <p className="mt-1 text-sm text-gray-500">Comencemos por lo básico para configurar tu espacio de trabajo.</p>
                </div>
                <div className="mt-5 md:col-span-2 md:mt-0">
                    <div className="grid grid-cols-6 gap-6">
                        <div className="col-span-6 sm:col-span-3">
                            <label className="block text-sm font-medium text-gray-700">RUT Empresa</label>
                            <input type="text" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border" placeholder="76.xxx.xxx-x" />
                        </div>
                        <div className="col-span-6 sm:col-span-3">
                            <label className="block text-sm font-medium text-gray-700">Nombre Fantasía</label>
                            <input type="text" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border" />
                        </div>
                    </div>
                    <div className="mt-5 flex justify-end">
                        <button onClick={onNext} className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-indigo-700">
                            Continuar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StepBank({ onNext, onBack }: any) {
    return (
        <div className="bg-white px-4 py-5 shadow sm:rounded-lg sm:p-6 text-center py-20">
            <h3 className="text-lg font-medium leading-6 text-gray-900">Carga tu Cartola Bancaria</h3>
            <p className="mt-2 text-sm text-gray-500 mb-6">Sube el Excel que descargas desde tu banco (Santander, Chile, BCI).</p>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 hover:bg-gray-50 cursor-pointer">
                <span className="text-indigo-600">Haz clic para subir .xlsx</span>
            </div>
            <div className="mt-5 flex justify-between">
                <button onClick={onBack} className="text-gray-600 text-sm">Atrás</button>
                <button onClick={onNext} className="rounded-md bg-indigo-600 py-2 px-4 text-sm font-medium text-white">Omitir por ahora</button>
            </div>
        </div>
    );
}

export default function OnboardingPage() {
    const [currentStep, setCurrentStep] = useState(0);

    const nextStep = () => setCurrentStep((p) => Math.min(p + 1, 3));
    const prevStep = () => setCurrentStep((p) => Math.max(p - 1, 0));

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
                <div className="mb-8 text-center">
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">Configuración Inicial</h1>
                    <p className="mt-2 text-lg text-gray-600">Te ayudaremos a dejar todo listo en menos de 5 minutos.</p>
                </div>

                <div className="mb-10">
                    <OnboardingProgress currentStepIndex={currentStep} />
                </div>

                <div className="mx-auto max-w-4xl">
                    {currentStep === 0 && <StepOrganization onNext={nextStep} />}
                    {currentStep === 1 && <StepBank onNext={nextStep} onBack={prevStep} />}
                    {/* Steps 2 and 3 omitted for brevity but follow pattern */}
                    {currentStep >= 2 && (
                        <div className="text-center">
                            <h3 className="text-xl">¡Listo! (Pasos restantes simulados)</h3>
                            <button className="mt-4 rounded-md bg-green-600 py-2 px-6 text-white font-bold">Ir al Dashboard</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
