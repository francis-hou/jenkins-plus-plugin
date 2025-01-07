// 存储正在进行的构建任务
const buildTasks = new Map();

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'JENKINS_BUILD_STATUS') {
        // 创建通知
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'images/icon128.png',
            title: 'Jenkins构建状态',
            message: request.message
        });
    } else if (request.type === 'START_BUILD_MONITOR') {
        // 开始监控构建状态
        const taskId = `${request.jobUrl}_${Date.now()}`;
        monitorBuildStatus(taskId, request.jobUrl, request.auth);
        sendResponse({ taskId });
    } else if (request.type === 'STOP_BUILD_MONITOR') {
        // 停止监控构建状态
        if (buildTasks.has(request.taskId)) {
            clearInterval(buildTasks.get(request.taskId));
            buildTasks.delete(request.taskId);
        }
    } else if (request.type === 'FETCH_JENKINS') {
        // 处理Jenkins API请求
        console.log('发送Jenkins请求:', request.url);
        console.log('请求方法:', request.method || 'GET');

        // 构建请求头
        const headers = {
            'Authorization': request.auth.authHeader,  // 使用预构建的认证头
            'Accept': '*/*'
        };

        // 如果是POST请求，添加额外的headers
        if (request.method === 'POST') {
            headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
        }

        // 直接发送请求
        fetch(request.url, {
            method: request.method || 'GET',
            headers: headers,
            redirect: 'follow'
        })
        .then(async response => {
            console.log('收到响应:', {
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries())
            });

            // 对于POST请求（构建触发），如果返回302或201或200都认为是成功的
            if (request.method === 'POST' && (response.status === 302 || response.status === 201 || response.status === 200)) {
                console.log('构建触发成功');
                sendResponse({ success: true, data: {} });
                return;
            }

            if (!response.ok) {
                const text = await response.text();
                console.error('请求失败:', {
                    status: response.status,
                    statusText: response.statusText,
                    headers: Object.fromEntries(response.headers.entries()),
                    body: text
                });
                throw new Error(`HTTP error! status: ${response.status}, body: ${text}`);
            }

            const contentType = response.headers.get('content-type');
            console.log('响应Content-Type:', contentType);

            if (contentType && contentType.includes('application/json')) {
                const data = await response.json();
                console.log('Jenkins响应成功:', data);
                sendResponse({ success: true, data });
            } else {
                const text = await response.text();
                console.log('非JSON响应:', text);
                sendResponse({ success: true, data: {} });
            }
        })
        .catch(error => {
            console.error('Jenkins请求失败:', error);
            sendResponse({ success: false, error: error.message });
        });
        
        return true; // 保持消息通道开放，等待异步响应
    }
    return true;
});

// 监控构建状态
function monitorBuildStatus(taskId, jobUrl, auth) {
    console.log(`开始监控构建状态: ${jobUrl}`);
    
    // 创建轮询间隔
    const intervalId = setInterval(async () => {
        try {
            const response = await fetch(`${jobUrl}/lastBuild/api/json`, {
                headers: {
                    'Authorization': 'Basic ' + btoa(`${auth.username}:${auth.token}`),
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('构建状态:', data);

            if (!data.building) {
                // 构建完成，发送通知
                chrome.runtime.sendMessage({
                    type: 'BUILD_COMPLETE',
                    success: data.result === 'SUCCESS',
                    message: `构建${data.result === 'SUCCESS' ? '成功' : '失败'}${data.description ? ': ' + data.description : ''}`
                });

                // 停止监控
                clearInterval(intervalId);
                buildTasks.delete(taskId);
            }
        } catch (error) {
            console.error('检查构建状态失败:', error);
            // 发生错误时也停止监控
            clearInterval(intervalId);
            buildTasks.delete(taskId);
        }
    }, 1000); // 每秒检查一次

    // 存储轮询任务
    buildTasks.set(taskId, intervalId);
} 