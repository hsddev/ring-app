const { RingApi } = require("ring-client-api");
const moment = require("moment");
const dotenv = require("dotenv");
const fs = require("fs");
const TelegramBot = require("node-telegram-bot-api");
const path = require("path");

dotenv.config();

const telegramToken = process.env.TELEGRAM_TOKEN;
const telegramChatId = process.env.TELEGRAM_CHAT_ID;
const motionsFilePath = path.join(__dirname, "motions.json");

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

const detectMotion = async () => {
    let ringApi = new RingApi({
        refreshToken:
            "eyJydCI6ImV5SmhiR2NpT2lKU1V6STFOaUlzSW1wcmRTSTZJaTl2WVhWMGFDOXBiblJsY201aGJDOXFkMnR6SWl3aWEybGtJam9pWkRjMFlqTmhNV1VpTENKMGVYQWlPaUpLVjFRaWZRLmV5SnBZWFFpT2pFM016RXdOalF3TlRZc0ltbHpjeUk2SWxKcGJtZFBZWFYwYUZObGNuWnBZMlV0Y0hKdlpEcDFjeTFsWVhOMExURTZPV0ZpTnpBNU5XTWlMQ0p2YVdGMElqb3hOek14TURZME1EVTJMQ0p5WldaeVpYTm9YMk5wWkNJNkluSnBibWRmYjJabWFXTnBZV3hmWVc1a2NtOXBaQ0lzSW5KbFpuSmxjMmhmYzJOdmNHVnpJanBiSW1Oc2FXVnVkQ0pkTENKeVpXWnlaWE5vWDNWelpYSmZhV1FpT2pFME56Y3hPRGMwTWl3aWNtNWtJam9pY1ZOdVpYWnhjbU4wV0NJc0luTmxjM05wYjI1ZmFXUWlPaUkwTURsak56Wm1aUzFpT1RWbUxUUTRPVFV0T1RCa1pTMDFZVFUwWlRKbFltVTROak1pTENKMGVYQmxJam9pY21WbWNtVnphQzEwYjJ0bGJpSjkuUTNySFNvN0Y3VjNZNUdhUTFPMnl1aVF5QlRxQmJvZFBJc2hjWlZnamN6T1ZDZDRMR0ItcWliNWh2cXU3Y1FtWGVhb1F5Z09xWWliSkpTLWd5QlN1NHBhaldqcHpTZ2JCQVFVRjY0Y2hqYVdZSmU1YkVsVmF6ZmlHMDJhaU04cFA1MmVld2dETFpvYThMUF9ObFNvS1NZZ0d5MVg5MnV3MTh0cWR2VEItOUlxVmQ2MmhKRDZ2VzVMdjd6MTZwQmcwYThEdHNnUDl1RzF4R0tzZV9CeDVNNERGMHlyMHc5TlRlMWxjVTV5c1VvUTFJRllMaXpKWl9jdXVyeDNtbGRNb2stV1ZXTUFvUmFFOEtUWlBpaW9iaFZqeUVNX0MtczdXdVdydlhPSVE3WkV5NENUXy14SDVVeTdPSEFLMnRxMmdiT0htMlQtNHRuVmJMWTJRQW5wSkt3IiwiaGlkIjoiOWM3NDk1ODQtMWFkNC01NTg5LWJjNjAtMGI5YjhlMGRjZjQ4In0=", // Replace with your actual token
        cameraStatusPollingSeconds: 10,
    });

    try {
        const devices = await ringApi.getCameras();

        if (devices.length > 0) {
            const camera = devices[0];

            let isRecording = false;

            if (!fs.existsSync(motionsFilePath)) {
                fs.writeFileSync(motionsFilePath, JSON.stringify([]));
            }

            // Fetch events
            const events = await camera.getEvents();

            const now = new Date();
            const oneMinuteAgo = new Date(now - 1 * 60 * 1000);

            // Filter events that occurred in the last 5 minutes
            let recentEvents = events.events.filter((event) => {
                const eventTime = new Date(event.created_at);
                return (
                    eventTime >= oneMinuteAgo &&
                    event.event_type === "motion" &&
                    !eventExists(event.event_id)
                );
            });

            if (
                recentEvents.length > 0 &&
                !eventExists(recentEvents[0].event_id)
            )
                addEventToFile(recentEvents[0]);

            // Check if there are recent events and no ongoing recording
            if (recentEvents.length > 0 && !isRecording) {
                isRecording = true;

                // Start recording
                await camera.recordToFile("motion_video.mp4", 20);

                // Path to the recorded video
                const videoPath = path.join(__dirname, "motion_video.mp4");

                await waitForRecordingCompletion(videoPath);

                // Send video to Telegram after recording is done
                await sendVideo(videoPath)
                    .then(() => {
                        console.log("Video sent to Telegram successfully.");
                        isRecording = false; // Reset recording flag
                    })
                    .catch((error) => {
                        console.error("Failed to send video:", error);
                        isRecording = false; // Reset even if there's an error
                    });
            }

            console.log(`Events in the last 1 minute:`, recentEvents.length);
        } else {
            console.log("No cameras found.");
        }
    } catch (error) {
        console.error("Error fetching camera data:", error);
    } finally {
        // Schedule the next call after a delay, only after this one completes
        setTimeout(detectMotion, 5000); // Adjust the delay as needed
    }
};

const sendVideo = async (videoPath) => {
    try {
        sendToTelegram(videoPath, "video");
    } catch (error) {
        console.error("Error recording or sending video:", error);
    }
};

const sendToTelegram = (filePath, type) => {
    if (type === "video") {
        bot.sendVideo(telegramChatId, filePath, {
            caption: `:eyes: Motion detected! Here is the recorded video.`,
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

// Function to check if an event ID already exists in motions.json
function eventExists(eventId) {
    const data = JSON.parse(fs.readFileSync(motionsFilePath));
    return data.some((event) => event.event_id === eventId);
}

// Function to add a new event to motions.json
function addEventToFile(event) {
    const data = JSON.parse(fs.readFileSync(motionsFilePath));
    data.push(event);
    fs.writeFileSync(motionsFilePath, JSON.stringify(data, null, 2));
}

async function waitForRecordingCompletion(videoPath) {
    return new Promise((resolve, reject) => {
        const interval = setInterval(() => {
            fs.promises
                .stat(videoPath)
                .then((stats) => {
                    if (stats.size > 0) {
                        clearInterval(interval);
                        resolve(videoPath);
                    }
                })
                .catch((error) => {
                    clearInterval(interval);
                    reject(error);
                });
        }, 1000); // Check every 500ms
    });
}

detectMotion();
