import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as compression from 'compression';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    app.use(compression());
    app.enableCors();
    // Backend API en 3000; frontend Next en 3001 (ver apps/web/package.json "dev": "next dev -p 3001")
    const port = Number(process.env.PORT) || 3000;
    await app.listen(port, '0.0.0.0');
    const url = await app.getUrl();
    console.log(`Application is running on: ${url}`);
    console.log(`API base: ${url} (frontend debe usar NEXT_PUBLIC_API_URL=${url})`);
}
bootstrap();
