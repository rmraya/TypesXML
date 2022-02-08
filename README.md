# TypesXML
Open source XML library written in TypeScript 
## Example
```TypeScript
import { XMLParser } from "./XMLParser";
import { Document } from "./Document";
import { readFile } from "fs";

class Test {

    constructor() {
        try {
            readFile('sample.xml', 'default.srx', 'utf-8', (err, data) => {
                if (err) {
                    throw new Error(err.message);
                }
                let parser: XMLParser = new XMLParser();
                let document: Document = parser.parse(data);
                console.log(document.toString());
            });
        } catch (e) {
            console.log(e.message)
        }
    }
}

new Test();
```
