// Content script for YouTube Quiz Generator Extension
// This script runs on YouTube pages and can interact with the page DOM

console.log('YouTube Quiz Generator: Content script loaded');

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getVideoInfo') {
        const videoInfo = extractVideoInfoFromPage();
        sendResponse(videoInfo);
    }
});

// Function to extract video information from the current YouTube page
function extractVideoInfoFromPage() {
    try {
        // Get video ID from URL
        const urlParams = new URLSearchParams(window.location.search);
        const videoId = urlParams.get('v');
        
        if (!videoId) {
            return { error: 'No video ID found in URL' };
        }

        // Try to get video title from various possible selectors
        let title = '';
        const titleSelectors = [
            'h1.ytd-video-primary-info-renderer',
            'h1.title.ytd-video-primary-info-renderer',
            'h1.ytd-watch-metadata',
            'h1.title',
            'meta[property="og:title"]',
            'title'
        ];

        for (const selector of titleSelectors) {
            const element = document.querySelector(selector);
            if (element) {
                title = element.textContent || element.content || element.innerText;
                if (title) break;
            }
        }

        // Clean up the title
        title = title.replace(/\s*-\s*YouTube$/, '').trim();

        // Get video URL
        const videoUrl = window.location.href;

        // Get additional metadata if available
        const description = document.querySelector('meta[name="description"]')?.content || '';
        const channelName = document.querySelector('ytd-channel-name a')?.textContent || 
                           document.querySelector('.ytd-channel-name')?.textContent || '';

        return {
            videoId: videoId,
            title: title,
            videoUrl: videoUrl,
            description: description,
            channelName: channelName,
            timestamp: Date.now()
        };

    } catch (error) {
        console.error('Error extracting video info:', error);
        return { error: 'Failed to extract video information' };
    }
}

// Function to check if we're on a valid YouTube video page
function isValidYouTubeVideoPage() {
    try {
        const url = window.location.href;
        const urlObj = new URL(url);
        
        return urlObj.hostname === 'www.youtube.com' && 
               urlObj.pathname === '/watch' && 
               urlObj.searchParams.has('v');
    } catch (error) {
        return false;
    }
}

// Function to get current video timestamp (if available)
function getCurrentVideoTimestamp() {
    try {
        const video = document.querySelector('video');
        if (video) {
            return Math.floor(video.currentTime);
        }
        return 0;
    } catch (error) {
        return 0;
    }
}

// Function to get video duration (if available)
function getVideoDuration() {
    try {
        const video = document.querySelector('video');
        if (video && video.duration) {
            return Math.floor(video.duration);
        }
        return 0;
    } catch (error) {
        return 0;
    }
}

// Expose functions to the popup script
window.YouTubeQuizGenerator = {
    extractVideoInfo: extractVideoInfoFromPage,
    isValidVideoPage: isValidYouTubeVideoPage,
    getCurrentTimestamp: getCurrentVideoTimestamp,
    getVideoDuration: getVideoDuration
};

// Log when the script is loaded on a valid YouTube video page
if (isValidYouTubeVideoPage()) {
    console.log('YouTube Quiz Generator: Valid YouTube video page detected');
} else {
    console.log('YouTube Quiz Generator: Not a valid YouTube video page');
} 