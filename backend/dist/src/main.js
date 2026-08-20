"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const configService = app.get(config_1.ConfigService);
    const port = configService.get('PORT') ?? 4000;
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
    }));
    app.enableCors({
        origin: true,
        credentials: true,
    });
    app.enableShutdownHooks();
    await app.listen(port, '0.0.0.0');
    console.log(`[RoadRadar] API: http://localhost:${port}/api`);
    console.log(`[RoadRadar] Socket.IO: http://localhost:${port}`);
}
void bootstrap();
//# sourceMappingURL=main.js.map