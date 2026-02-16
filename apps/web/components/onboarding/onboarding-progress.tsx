import { useState } from 'react';
import { CheckIcon } from '@heroicons/react/24/solid';

const steps = [
    { id: '01', name: 'Crear Organización', description: 'Datos básicos de tu empresa', status: 'current' },
    { id: '02', name: 'Conectar Banco', description: 'Carga tu primera cartola', status: 'upcoming' },
    { id: '03', name: 'Sincronizar SII', description: 'Conecta LibreDTE', status: 'upcoming' },
    { id: '04', name: 'Invitar Equipo', description: 'Define roles y accesos', status: 'upcoming' },
];

export function OnboardingProgress({ currentStepIndex }: { currentStepIndex: number }) {
    return (
        <nav aria-label="Progress">
            <ol role="list" className="overflow-hidden rounded-md lg:flex lg:rounded-none lg:border-l lg:border-r lg:border-gray-200">
                {steps.map((step, stepIdx) => (
                    <li key={step.id} className="relative overflow-hidden lg:flex-1">
                        <div
                            className={`
                ${stepIdx < currentStepIndex ? 'border-b-4 border-indigo-600' : ''}
                ${stepIdx === currentStepIndex ? 'border-b-4 border-indigo-600' : ''}
                ${stepIdx > currentStepIndex ? 'border-b-4 border-gray-200' : ''}
                overflow-hidden lg:border-0
              `}
                        >
                            {/* Desktop View (Horizontal) usually handled by specific CSS or just simple text for MVP */}
                            <a href="#" className="group">
                                <span
                                    className={`
                      absolute left-0 top-0 h-full w-1 bg-transparent lg:bottom-0 lg:top-auto lg:h-1 lg:w-full
                      ${stepIdx < currentStepIndex ? 'bg-indigo-600' : ''}
                      ${stepIdx === currentStepIndex ? 'bg-indigo-600' : ''}
                      ${stepIdx > currentStepIndex ? 'bg-gray-200' : ''}
                    `}
                                    aria-hidden="true"
                                />
                                <span className={`flex items-start px-6 py-5 text-sm font-medium ${stepIdx !== 0 ? 'lg:pl-9' : ''}`}>
                                    <span className="flex-shrink-0">
                                        {stepIdx < currentStepIndex ? (
                                            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600">
                                                <CheckIcon className="h-6 w-6 text-white" aria-hidden="true" />
                                            </span>
                                        ) : stepIdx === currentStepIndex ? (
                                            <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-indigo-600">
                                                <span className="text-indigo-600">{step.id}</span>
                                            </span>
                                        ) : (
                                            <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-gray-300">
                                                <span className="text-gray-500">{step.id}</span>
                                            </span>
                                        )}
                                    </span>
                                    <span className="ml-4 mt-0.5 flex min-w-0 flex-col">
                                        <span className={`text-sm font-medium ${stepIdx <= currentStepIndex ? 'text-indigo-600' : 'text-gray-500'}`}>{step.name}</span>
                                        <span className="text-sm text-gray-500">{step.description}</span>
                                    </span>
                                </span>
                            </a>
                        </div>
                    </li>
                ))}
            </ol>
        </nav>
    );
}
