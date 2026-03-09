// geminiDecodeImage.ts
import axios from "axios";
const API_KEY = "AIzaSyBNQjtsARkFnbAOw-01k-5og2VKl8qvBwk";

// coloque seu base64 aqui (sem data:image/png;base64,)
const IMAGE_BASE64 = "";

async function GetCaptchaChallenge() {
    try {
        const { data } = await axios({
            method: 'post',
            maxBodyLength: Infinity,
            url: 'https://passwordreset.microsoftonline.com/Default.aspx/GetCaptchaChallenge',
            headers: {
                'Accept': '*/*',
                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                'Connection': 'keep-alive',
                'Content-Type': 'application/json; charset=UTF-8',
                'Origin': 'https://passwordreset.microsoftonline.com',
                'Referer': 'https://passwordreset.microsoftonline.com/?username=andre.marra@galapagoscapital.com',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
                'X-Requested-With': 'XMLHttpRequest',
                'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'Cookie': 'ASP.NET_SessionId=bggtdsakmpk25vmquxo4mqgt; CookiesSupportedCookie=True; SessionId=3vehoj4qjzfmbzhdkakavanm; TrackingId=9d060a6c347c42749f5b6f9e5fdc2234; flt=GraphPolicyRead; x-ms-gateway-dc=SN01P; x-ms-gateway-env=PROD; x-ms-gateway-su=a'
            },
            data: { "challengeType": "Visual" }
        })

        if (data.d) {
            return JSON.parse(data.d)
        }

    } catch (error) {
        console.error(error);
        return null;
    }
}

async function decodeImage() {
    const challenge = await GetCaptchaChallenge();
    if (!challenge) {
        console.error("Failed to get captcha challenge");
        return;
    }
    const { ChallengeData } = challenge;
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${API_KEY}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                contents: [
                    {
                        role: "user",
                        parts: [
                            {
                                text: "Return only the raw text found in the image, no explanation, no formatting, no extra words."
                            },
                            {
                                inline_data: {
                                    mime_type: "image/jpeg", // troque se for jpeg
                                    data: ChallengeData
                                }
                            }
                        ]
                    }
                ]
            })
        }
    );

    const data = await response.json();

    console.log(data?.candidates[0]?.content?.parts[0]?.text);
}

decodeImage();