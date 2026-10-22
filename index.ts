import { Application } from './app';
import fs from 'fs/promises';
import path from 'path';
import IEnvironment from './core/interfaces/environment';


async function loadEnvironment(): Promise<IEnvironment> {
    try {
        const filePath = path.join(__dirname, 'environments', 'environment.json');
        const data = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Failed to load environment file:', error);
        throw error;
    }
}



async function initApplication() {
    const application = new Application();
    try {
        const env = await loadEnvironment();
        await application.INIT(env);
    } catch (error) {
        console.error('Application initialization failed:', error);
    }
}



void (async () => {
    try {
        await initApplication();
    } catch (error) {
        console.error('Error during application startup:', error);
    }
})();
