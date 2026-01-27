import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    app.enableCors(); // Enabled for all origins for MVP development
    const port = process.env.PORT || 3001;
    await app.listen(port, '0.0.0.0');
    console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
