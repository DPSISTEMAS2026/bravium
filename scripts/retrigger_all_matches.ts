import { PrismaClient } from '@prisma/client';
import { ConciliacionService } from '../src/modules/conciliacion/conciliacion.service';
import { Test, TestingModule } from '@nestjs/testing';
import { ConciliacionModule } from '../src/modules/conciliacion/conciliacion.module';
import { PrismaModule } from '../src/common/prisma/prisma.module';

const prisma = new PrismaClient();

async function main() {
    console.log('Borrando TODAS las sugerencias pendientes (limpiando caché del motor antiguo)...');
    
    const count = await prisma.matchSuggestion.deleteMany({
        where: {
            status: 'PENDING' // Solo borrar las que no han sido aceptadas ni rechazadas
        }
    });

    console.log(`✅ ${count.count} sugerencias obsoletas eliminadas.`);

    console.log('\nSi deseas volver a generar las sugerencias, ve a "Cartolas" en la plataforma y pulsa "Ejecutar conciliación".');
    console.log('Este botón ejecutará el motor actualizado y no creará cruces de montos idénticos pero con RUT distinto.');
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
