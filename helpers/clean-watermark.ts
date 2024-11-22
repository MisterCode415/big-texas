export function cleanWatermark(text: string, pattern: string) {
    const delimiter = '\n'; // lets inspect each line
    const parts = text.split(delimiter);
    let index = 0;
    for (const part of parts) {

        console.log('part: ', part);
        const allMatchingChars = pattern.split('').every(char => part.includes(char));
        const someMatchingChars = pattern.split('').some(char => part.includes(char));
        const matchingOtherChars = part.split('').filter(char => !pattern.includes(char)).join('');
        console.log('allMatchingChars: ', allMatchingChars);
        console.log('someMatchingChars: ', someMatchingChars);
        console.log('matchingOtherChars: ', matchingOtherChars);
        if (allMatchingChars || (!matchingOtherChars && someMatchingChars)) {
            parts.splice(index, 1);
        }
        index++;
    }
    return parts.join(delimiter);
}
// test with
// console.log('yield: ', cleanWatermark("hello\nREEVES COUNTY CLERK\nworld", "REEVES COUNTY CLERK"));
// console.log('--------------------------------');

// console.log('yield: ', cleanWatermark("hello\nREEVES COUNTY\nworld", "REEVES COUNTY CLERK"));
// console.log('--------------------------------');

// console.log('yield: ', cleanWatermark("hello\nRE  COY\nworld", "REEVES COUNTY ClERK"));
// console.log('--------------------------------');

// console.log('yield: ', cleanWatermark("hello\nREE Y\nworld", "REEVES COUNTY ClERK"));
// console.log('--------------------------------');
