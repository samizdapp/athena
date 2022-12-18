/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app/app.module';

class App {
    constructor() {
        this.start().catch(err => {
            console.log('Error starting app', err);
        });
    }
    async start() {
        const app = await NestFactory.create(AppModule);
        const globalPrefix = '/smz/api/networking';
        app.setGlobalPrefix(globalPrefix);
        const port = process.env.PORT || 3413;
        await app.listen(port);
        Logger.log(
            `🚀 Application is running on: http://localhost:${port}${globalPrefix}`
        );
    }
}

export default new App();
