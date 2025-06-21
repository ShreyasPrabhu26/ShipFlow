import dotenv from 'dotenv';
import { createClient, commandOptions } from "redis";
import { downloadS3Folder } from "./aws";
import Logger from "./utils/logger";

const subscriber = createClient();
subscriber.connect();

dotenv.config();

async function main() {
    Logger.info('Deploy service started');
    Logger.info('Waiting for build queue messages...');
    
    while (1) {
        try {
            const res = await subscriber.brPop(
                commandOptions({ isolated: true }),
                'build-queue',
                0
            );
            
            if (res && res.element) {
                Logger.info(`Received message from build queue: ${res.element}`);
                await downloadS3Folder(res.element);
                Logger.info(`Processing complete for ${res.element}`);
            }
        } catch (error) {
            Logger.error('Error processing build queue message:', error);
            // Sleep a bit before retrying to prevent tight error loops
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

Logger.info('Starting deploy service...');
main().catch(error => {
    Logger.error('Fatal error in deploy service:', error);
    process.exit(1);
});