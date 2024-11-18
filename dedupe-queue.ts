// dedupe-queue.ts

const { MongoClient } = require('mongodb');

async function dedupeCollection() {
    const uri = process.env.MONGODB_URI;
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const database = client.db('big-texas'); // Replace with the database name
        const collection = database.collection('payloads-dedupe'); // Replace with the collection name

        // Step 1: Find duplicates
        const duplicates = await collection.aggregate([
            {
                $group: {
                    _id: { fileId: "$fileId" },
                    count: { $sum: 1 },
                    ids: { $push: "$_id" }
                }
            },
            {
                $match: { count: { $gt: 1 } }
            }
        ]).toArray();

        // Step 2: Remove duplicates
        for (const duplicate of duplicates) {
            const idsToRemove = duplicate.ids.slice(1); // Keep the first one, remove the rest
            await collection.deleteMany({ _id: { $in: idsToRemove } });
        }

        console.log('Deduplication completed successfully.');
    } catch (error) {
        console.error('Error during deduplication:', error);
    } finally {
        await client.close();
    }
}

const mergeCollection = async () => {
    const uri = process.env.MONGODB_URI;
    const client = new MongoClient(uri);
    await client.connect();
    const database = client.db('big-texas');
    const collectionToMergeInto = database.collection('seed-data-dedupe');
    const collectionToMerge = database.collection('payloads-dedupe');
    const all = await collectionToMerge.find({}, { sort: { _id: -1 } });
    for await (const doc of all) {
        await collectionToMergeInto.updateOne({ fileId: doc.fileId }, {
            $set: {
                internalId: doc.internalId
            }
        }, { upsert: false });
    }
}

mergeCollection();