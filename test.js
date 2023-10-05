const { Client, LocalAuth, MessageMedia } = require('./whatsapp-web.js/index');
const qrcode = require('qrcode-terminal');
const puppeteer = require('puppeteer');
const Jimp = require('jimp');
const fetch = require('node-fetch');
const apiKey = 'AIzaSyCIX2RuL4NHXQqI7zNjLSGjN6jN40k-JA4';
const cseId = '928c784aba99a434a';
const axios = require('axios');

const client = new Client({
    authStrategy: new LocalAuth()
});

async function googleSearch(data, numResults) {
    try {
        const resultsPerPage = 10;
        let totalResults = [];

        // Calculate the number of pages needed to fetch numResults
        const totalPages = Math.ceil((data.number ? data.number : 10) / resultsPerPage);

        for (let page = 1; page <= totalPages; page++) {
            const startIndex = (page - 1) * resultsPerPage + 1;

            // Make a request to the Google Custom Search API for each page
            const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
                params: {
                    key: apiKey,
                    cx: cseId,
                    q: data.text,
                    num: (data.number ? data.number : 10),
                    start: startIndex,
                },
            });

            // Parse and append the search results from this page
            const results = response.data.items || [];
            totalResults = totalResults.concat(results);
        }

        return totalResults.map((item) => ({
            title: item.title,
            link: item.link,
        }));
    } catch (error) {
        console.error('Error performing Google search:', error);
        throw error;
    }
}

function extractSearchValue(inputString) {
    // Check if the string starts with "search:"
    if (inputString.startsWith("search ")) {
        // Remove "search:" and any leading white spaces
        const trimmedString = inputString.replace(/^search:\s*/, '');

        // Check if the trimmedString ends with "{number}"
        const numberMatch = trimmedString.match(/\{(\d+)\}$/);

        if (numberMatch) {
            // Extract the number and create a dictionary
            const number = parseInt(numberMatch[1]);
            return { text: trimmedString.substring(0, trimmedString.length - numberMatch[0].length), number };
        } else {
            // If it doesn't end with a number, return a dictionary with null
            return { text: trimmedString, number: null };
        }
    } else {
        // If it doesn't start with "search:", return null
        return null;
    }
}

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
    console.log('Client is ready!');
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    client.on('message', async (msg) => {
        if (msg.body.startsWith('http')) {
            try {

                await page.goto(msg.body, { waitUntil: 'domcontentloaded' });
                await page.waitForTimeout(3000);

                const screenshotBuffer = await page.screenshot({ fullPage: true });

                const jimpImage = await Jimp.read(screenshotBuffer);
                const imageWidth = jimpImage.getWidth();
                const imageHeight = jimpImage.getHeight();
                console.log(`Image dimensions: ${imageHeight} x ${imageWidth}`);

                const pieceHeight = 1000;
                const totalPieces = Math.ceil(imageHeight / pieceHeight);

                for (let i = 0; i < totalPieces; i++) {
                    const startY = i * pieceHeight;
                    const endY = Math.min((i + 1) * pieceHeight, imageHeight);
                    console.log("test");
                    console.log("left: 0" + ", top: " + startY + ", width: " + imageWidth + ", height: " + (endY - startY));
                    if (startY < imageHeight && endY <= imageHeight) {
                        const pieceHeight = endY - startY;
                        const pieceJimp = jimpImage.clone().crop(0, startY, imageWidth, pieceHeight);
                        const pieceBuffer = await pieceJimp.getBufferAsync(Jimp.MIME_PNG);

                        const base64Piece = pieceBuffer.toString('base64');
                        const media = new MessageMedia('image/png', base64Piece);
                        await client.sendMessage(msg.from, media);
                        console.log(`Sent piece ${i + 1}/${totalPieces}`);
                    } else {
                        console.log(`Skipped piece ${i + 1} (out of bounds)`);
                    }
                }

            } catch (error) {
                console.error("Error:", error);
                msg.reply("An error occurred while processing your request: " + error.message);
            }
        } else if (extractSearchValue(msg.body)) {
            googleSearch(extractSearchValue(msg.body))
                .then((results) => {
                    console.log('Search results:', results);
                    msg.reply("search results")
                    for (let i = 0; i < results.length; i++) {
                        msg.reply(`title: ${results[i].title}
link: ${results[i].link}`)
                    }
                })
                .catch((error) => {
                    console.error('An error occurred:', error);
                });
        }
        else {
            msg.reply("Please provide a valid command.");
        }
    });
});

client.initialize();