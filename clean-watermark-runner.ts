import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { cleanWatermark } from './helpers/clean-watermark';
dotenv.config();
const client = new MongoClient(process.env.MONGODB_URI);

async function main() {
    await client.connect();
    const db = client.db('big-texas');
    const collection = db.collection('leases-meta-dewatermark');
    const documents = await collection.find({ text: { $ne: null } });
    const total = await documents.count();
    let i = 0;
    for await (const document of documents) {
        i++;
        const cleaned = cleanWatermark(document.text, 'REEVES COUNTY CLERK');
        console.log(`cleaned ${i} of ${total}`);
        try {
            await collection.updateOne({ _id: document._id }, { $set: { dewatermarked: cleaned } }, { upsert: false });
        } catch (error) {
            console.error(error);
        }
    }
    await client.close();
}

main().catch(console.error);