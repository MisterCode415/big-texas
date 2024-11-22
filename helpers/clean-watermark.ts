export function cleanWatermark(text: string, pattern: string) {
    const delimiter = '\n'; // lets inspect each line
    const parts = text.split(delimiter);
    let index = 0;
    const deleteList: number[] = [];
    for (const part of parts) {

        // console.log('part: ', part);
        const allMatchingChars = pattern.split('').every(char => part.toLowerCase().includes(char.toLowerCase()));
        const someMatchingChars = pattern.split('').some(char => part.toLowerCase().includes(char.toLowerCase()));
        const matchingOtherChars = part.split('').filter(char => !pattern.toLowerCase().includes(char.toLowerCase())).join('');
        // console.log('allMatchingChars: ', allMatchingChars);
        // console.log('someMatchingChars: ', someMatchingChars);
        // console.log('matchingOtherChars: ', matchingOtherChars);
        if (allMatchingChars || (!matchingOtherChars && someMatchingChars)) {
            deleteList.push(index);
        }
        index++;
    }
    return parts.filter((_, index) => !deleteList.includes(index)).join(delimiter);
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
