import dotenv from 'dotenv';
import { createClient, commandOptions } from "redis";
import { downloadS3Folder, uploadDistFolder } from "./aws";
import Logger from "./utils/logger";
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';

const subscriber = createClient();
subscriber.connect();

const publisher = createClient();
publisher.connect()

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
                await buildProject(res.element);
                Logger.info(`Processing complete for ${res.element}`);
            }
        } catch (error) {
            Logger.error('Error processing build queue message:', error);
            // Sleep a bit before retrying to prevent tight error loops
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

export async function buildProject(id: string) {
    return new Promise((resolve, reject) => {
        // Use absolute path for better reliability
        const projectRoot = path.resolve(process.cwd());
        const outputDir = path.join(projectRoot, `output/${id}`);

        Logger.info(`Building project ${id}... in directory ${outputDir}`);

        // Check if directory exists before building
        if (!fs.existsSync(outputDir)) {
            const errorMsg = `Project directory not found: ${outputDir}`;
            Logger.error(errorMsg);
            return reject(new Error(errorMsg));
        }

        // Run npm commands with more verbose output
        const buildCmd = `cd "${outputDir}" && npm install && npm run build`;
        Logger.info(`Executing command: ${buildCmd}`);

        const child = exec(buildCmd);

        child.stdout?.on('data', function (data) {
            Logger.info(`[BUILD][stdout] ${data.trim()}`);
        });

        child.stderr?.on('data', function (data) {
            Logger.error(`[BUILD][stderr] ${data.trim()}`);
        });

        child.on('close', async function (code) {
            if (code === 0) {
                Logger.info(`Build successful for project ${id}`);
                publisher.hSet("status", id, "Deployed")

                // Verify the dist folder was created
                const distDir = path.join(outputDir, 'dist');
                if (!fs.existsSync(distDir)) {
                    const errorMsg = `Build did not generate a dist folder at ${distDir}`;
                    Logger.error(errorMsg);
                    return reject(new Error(errorMsg));
                }

                Logger.info(`Dist folder found at ${distDir}`);

                try {
                    // Generate a timestamp-based deployment ID
                    const deploymentId = new Date().toISOString().replace(/[:.]/g, '-');

                    // Upload the dist folder to S3
                    await uploadDistFolder(id, deploymentId);
                    Logger.info(`Deployment ${deploymentId} completed for project ${id}`);
                    resolve("");
                } catch (error) {
                    Logger.error(`Failed to upload dist folder for project ${id}:`, error);
                    reject(error);
                }
            } else {
                const errorMsg = `Build failed for project ${id} with exit code ${code}`;
                Logger.error(errorMsg);
                reject(new Error(errorMsg));
            }
        });
    });
}

Logger.info('Starting deploy service...');
main().catch(error => {
    Logger.error('Fatal error in deploy service:', error);
    process.exit(1);
});