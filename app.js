const { RingApi } = require("ring-client-api");
const fs = require("fs");
const TelegramBot = require("node-telegram-bot-api");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

const telegramToken = process.env.TELEGRAM_TOKEN;
const telegramChatId = process.env.TELEGRAM_CHAT_ID;

const bot = new TelegramBot(telegramToken, {
    polling: true,
    allowed_updates: [
        "message",
        "callback_query",
        "inline_query",
        "my_chat_member",
        "chat_member",
    ],
});

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    console.log("Received /start command from:", msg.chat.username);

    const options = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "Take Snapshot", callback_data: "snapshot" },
                    { text: "Start Video Stream", callback_data: "video" },
                ],
            ],
        },
    };

    bot.sendMessage(chatId, "Welcome! Choose an option:", options);
});

bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data === "snapshot") {
        try {
            const ringApi = new RingApi({
                refreshToken: process.env.RING_REFRESH_TOKEN, // Add this to .env in Replit Secrets
            });
            const cameras = await ringApi.getCameras();

            if (cameras.length === 0) {
                bot.sendMessage(chatId, "No cameras found!");
                return;
            }

            const camera = cameras[0]; // Assuming you want the first camera

            const snapshot = await camera.getSnapshot();

            if (snapshot) {
                bot.sendPhoto(chatId, snapshot, {
                    filename: "snapshot.jpg",
                    caption: "Here is your snapshot!",
                });
            } else {
                console.error("Snapshot is empty or undefined.");
            }
        } catch (err) {
            bot.sendMessage(chatId, `Error taking snapshot: ${err.message}`);
        }
    }

    if (data === "video") {
        bot.sendMessage(
            chatId,
            "Video stream functionality not implemented yet."
        );
    }
});

const sendVideo = async (videoPath) => {
    try {
        sendToTelegram(videoPath, "video");
    } catch (error) {
        console.error("Error recording or sending video:", error);
    }
};

const setupMotionDetection = async () => {
    try {
        const ringApi = new RingApi({
            refreshToken: process.env.RING_REFRESH_TOKEN,
        });
        const cameras = await ringApi.getCameras();

        if (cameras.length === 0) {
            console.log("No cameras found.");
            return;
        }

        const camera = cameras[0]; // Using the first camera found

        // Subscribing to motion events
        const motion = await camera.subscribeToMotionEvents();
        console.log(motion);

        setInterval(async () => {
            camera.onMotionStarted.subscribe((detected) => {
                console.log("detected", detected);
            });
        }, 5000);

        // camera.onMotionStarted.subscribe(async (motionDetected) => {
        //     console.log(motionDetected);
        //     if (!motionDetected) {
        //         console.log("Motion detected!");
        //         console.log("Recording for 10 seconds...");
        //         const videoBuffer = await camera.recordToFile(
        //             "motion_video.mp4",
        //             5
        //         );
        //         const videoPath = path.join(__dirname, "motion_video.mp4");

        //         sendVideo(videoPath);
        //     } else {
        //         console.log("Motion stopped.");
        //     }
        // });
    } catch (error) {
        console.error("Error setting up motion detection:", error);
    }
};

const sendToTelegram = (filePath, type) => {
    if (type === "video") {
        bot.sendVideo(telegramChatId, filePath, {
            caption: ":eyes: Motion detected! Here is the recorded video.",
        })
            .then(() => {
                fs.unlinkSync(filePath);
                console.log("Video sent and file deleted.");
            })
            .catch((error) => {
                console.error("Error sending video to Telegram:", error);
            });
    }
};

setupMotionDetection();
