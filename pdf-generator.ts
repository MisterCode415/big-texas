import { PDFDocument, rgb } from 'pdf-lib';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

export class PDFGenerator {
    private storageBucketUrl: string;
    private metadataFolder: string;

    constructor() {
    }
    private jsonToText(json: Record<string, any>): string {
        let text = '';
        for (const [key, value] of Object.entries(json)) {
            text += `${key.replace(/[^\x20-\x7E]/g, '')}: ${value.replace(/[^\x20-\x7E]/g, '')}\n\n\n`;
        }
        return text;
    }
    private jsonToTable(json: Record<string, any>): string {
        const keys = Object.keys(json);
        const values = Object.values(json);

        // Determine the maximum key length for formatting
        const maxKeyLength = Math.max(...keys.map(key => key.length));

        let table = '';
        for (let i = 0; i < keys.length; i++) {
            // Pad the key for alignment
            const paddedKey = keys[i].padEnd(maxKeyLength, ' ');
            table += `${paddedKey} : ${values[i]}\n\n`;
        }
        return table;
    }
    async generatePDF(internalId: string, fileData: Buffer[], nextLeaseBundle?: string): Promise<Uint8Array> {
        const pdfDoc = await PDFDocument.create();

        for (const fileBuffer of fileData) {
            try {
                const image = await pdfDoc.embedPng(fileBuffer);
                const page = pdfDoc.addPage([image.width, image.height]);

                page.drawImage(image, {
                    x: 0,
                    y: 0,
                    width: image.width,
                    height: image.height,
                });
            } catch (error) {
                console.error(`Error embedding image: ${error}`);
            }
        }

        // Serialize the PDF document to bytes
        const pdfBytes = await pdfDoc.save();
        return pdfBytes;
    }

    private async downloadImage(url: string): Promise<Buffer> {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to download image from ${url}`);
        }
        return await response.buffer();
    }

    private async loadMetadata(filePath: string): Promise<any> {
        return new Promise((resolve, reject) => {
            fs.readFile(filePath, 'utf-8', (err, data) => {
                if (err) {
                    return reject(err);
                }
                resolve(JSON.parse(data));
            });
        });
    }
}