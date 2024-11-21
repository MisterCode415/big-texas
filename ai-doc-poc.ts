import {
    DocumentClassifierBuildOperationDetailsOutput,
    getLongRunningPoller,
    isUnexpected,
} from "@azure-rest/ai-document-intelligence";

const containerSasUrl = (): string =>
    process.env["DOCUMENT_INTELLIGENCE_TRAINING_CONTAINER_SAS_URL"];
const initialResponse = await client.path("/documentClassifiers:build").post({
    body: {
        classifierId: `customClassifier${getRandomNumber()}`,
        description: "Custom classifier description",
        docTypes: {
            foo: {
                azureBlobSource: {
                    containerUrl: containerSasUrl(),
                },
            },
            bar: {
                azureBlobSource: {
                    containerUrl: containerSasUrl(),
                },
            },
        },
    },
});

if (isUnexpected(initialResponse)) {
    throw initialResponse.body.error;
}
const poller = await getLongRunningPoller(client, initialResponse);
const response = (await poller.pollUntilDone())
    .body as DocumentClassifierBuildOperationDetailsOutput;
console.log(response);