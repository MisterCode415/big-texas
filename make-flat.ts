import codeBase from './county-codes.json';
import fs from 'fs';
// Function to flatten the codes and descriptions
function flattenCodes(codes: any[]): any[] {
    const flattened = [];

    codes.forEach(codeEntry => {
        const { code, docGroup } = codeEntry;
        docGroup.forEach(group => {
            const { description, docType } = group;
            docType.forEach(type => {
                flattened.push(type.code);
                // details
                // flattened.push({
                //     code: type.code,
                //     description: type.description,
                //     groupCode: code,
                //     groupDescription: description
                // });
            });
        });
    });

    return { documentTypes: flattened };
}

// Flatten the codes
const flattenedCodes = flattenCodes(codeBase.codes);
// write to disk
fs.writeFileSync('flat-codes.json', JSON.stringify(flattenedCodes, null, 2));