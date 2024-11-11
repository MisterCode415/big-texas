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

        // add a new page for the metadata to the pdf
        // const metadataPage = pdfDoc.addPage([2378, 1500]);

        // // Set initial y position
        // let yPosition = 1400; // Start near the top of the page

        // metadataPage.drawText(internalId, {
        //     x: 50,
        //     y: yPosition,
        //     size: 65,
        //     color: rgb(0, 0, 0),
        // });

        // // Update y position for the next text
        // yPosition -= 110; // Move down for the next line

        // metadataPage.drawText(this.jsonToText(JSON.parse(nextLeaseBundle)), {
        //     x: 50,
        //     y: yPosition,
        //     size: 45,
        //     color: rgb(0, 0, 0),
        // });

        // // Update y position for the next text
        // yPosition -= 15; // Move down for the next line

        // const jsonTable = this.jsonToTable(JSON.parse(nextLeaseBundle));
        // const tableLines = jsonTable.split('\n');
        // for (const line of tableLines) {
        //     metadataPage.drawText(line, {
        //         x: 10,
        //         y: yPosition,
        //         size: 12,
        //         color: rgb(0, 0, 0),
        //     });
        //     yPosition -= 15; // Move down for the next line
        // }

        for (const fileBuffer of fileData) {
            const image = await pdfDoc.embedPng(fileBuffer);
            const page = pdfDoc.addPage([image.width, image.height]);

            page.drawImage(image, {
                x: 0,
                y: 0,
                width: image.width,
                height: image.height,
            });


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