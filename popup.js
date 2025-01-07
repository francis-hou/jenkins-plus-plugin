document.addEventListener('DOMContentLoaded', function() {
    // DOM元素
    const savedServers = document.getElementById('savedServers');
    const serverList = document.getElementById('serverList');
    const addServerForm = document.getElementById('addServerForm');
    const jobsList = document.getElementById('jobsList');
    const connectButton = document.getElementById('connectButton');
    const addServerButton = document.getElementById('addServerButton');
    const backToList = document.getElementById('backToList');
    const backToServers = document.getElementById('backToServers');
    const refreshJobs = document.getElementById('refreshJobs');
    const searchInput = document.getElementById('searchJobs');
    const jobsContainer = document.getElementById('jobsContainer');
    const importServers = document.getElementById('importServers');
    const exportServers = document.getElementById('exportServers');
    const fileInput = document.getElementById('fileInput');
    const editServerForm = document.getElementById('editServerForm');
    const backToListFromEdit = document.getElementById('backToListFromEdit');
    const saveButton = document.getElementById('saveButton');
    let editingServerIndex = -1;

    // 当前选中的Jenkins服务器
    let currentServer = null;

    // 导出服务器配置
    exportServers.addEventListener('click', async () => {
        try {
            const { servers = [] } = await chrome.storage.sync.get('servers');
            if (servers.length === 0) {
                showNotification('没有可导出的服务器配置', { type: 'error' });
                return;
            }

            const blob = new Blob([JSON.stringify(servers, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'jenkins-servers.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showNotification('服务器配置已导出', { type: 'success' });
        } catch (error) {
            console.error('导出失败:', error);
            showNotification('导出失败: ' + error.message, { type: 'error' });
        }
    });

    // 导入服务器配置
    importServers.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', async (event) => {
        try {
            const file = event.target.files[0];
            if (!file) {
                return;
            }

            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const servers = JSON.parse(e.target.result);
                    if (!Array.isArray(servers)) {
                        throw new Error('无效的配置文件格式');
                    }

                    // 验证每个服务器配置
                    servers.forEach(server => {
                        if (!server.url || !server.username || !server.token) {
                            throw new Error('服务器配置缺少必要字段');
                        }
                    });

                    // 保存服务器配置
                    await chrome.storage.sync.set({ servers });
                    await showServerList();
                    showNotification('服务器配置已导入', { type: 'success' });
                } catch (error) {
                    console.error('导入失败:', error);
                    showNotification('导入失败: ' + error.message, { type: 'error' });
                }
            };
            reader.readAsText(file);
        } catch (error) {
            console.error('导入失败:', error);
            showNotification('导入失败: ' + error.message, { type: 'error' });
        } finally {
            // 清空文件输入框，这样同一个文件可以再次选择
            fileInput.value = '';
        }
    });

    // 显示服务器列表
    async function showServerList() {
        try {
            console.log('开始加载服务器列表...');
            
            // 获取服务器列表和筛选状态
            const { servers = [] } = await chrome.storage.sync.get(['servers']);
            const { filterState = {} } = await chrome.storage.local.get(['filterState']);
            console.log('从存储中读取的服务器列表:', servers);
            console.log('当前筛选状态:', filterState);
            
            if (!Array.isArray(servers)) {
                console.error('服务器列表格式错误:', servers);
                throw new Error('服务器列表格式错误');
            }
            
            // 清空现有列表
            serverList.innerHTML = '';
            
            // 更新筛选器选项
            const projectFilter = document.getElementById('projectFilter');
            const envFilter = document.getElementById('envFilter');
            
            // 移除旧的事件监听器
            if (projectFilter._changeHandler) {
                projectFilter.removeEventListener('change', projectFilter._changeHandler);
            }
            if (envFilter._changeHandler) {
                envFilter.removeEventListener('change', envFilter._changeHandler);
            }
            
            // 获取所有项目名称
            const projects = new Set(servers.map(s => s.project).filter(Boolean));
            console.log('可用的项目列表:', Array.from(projects));
            
            // 更新项目筛选器选项
            projectFilter.innerHTML = '<option value="">所有项目</option>';
            Array.from(projects).sort().forEach(project => {
                const option = document.createElement('option');
                option.value = project;
                option.textContent = project;
                if (project === filterState.project) {
                    option.selected = true;
                }
                projectFilter.appendChild(option);
            });
            
            // 恢复环境筛选值
            if (filterState.env) {
                envFilter.value = filterState.env;
            }
            
            // 应用筛选器
            const selectedProject = projectFilter.value;
            const selectedEnv = envFilter.value;
            console.log('应用筛选条件:', { project: selectedProject, env: selectedEnv });
            
            const filteredServers = servers.filter(server => {
                const projectMatch = !selectedProject || server.project === selectedProject;
                const envMatch = !selectedEnv || server.envType === selectedEnv;
                return projectMatch && envMatch;
            });
            
            console.log('筛选后的服务器列表:', filteredServers);
            
            if (filteredServers.length === 0) {
                console.log('筛选后没有匹配的服务器');
                const emptyMessage = document.createElement('div');
                emptyMessage.className = 'empty-message';
                emptyMessage.textContent = '没有匹配的服务器';
                serverList.appendChild(emptyMessage);
                return;
            }
            
            // 显示筛选后的服务器列表
            filteredServers.forEach((server, index) => {
                console.log(`创建服务器项 ${index + 1}:`, server);
                
                const serverElement = document.createElement('div');
                serverElement.className = 'server-item';
                
                const serverInfo = document.createElement('div');
                serverInfo.className = 'server-info';
                
                const serverLabel = document.createElement('div');
                serverLabel.className = 'server-label';
                
                // 添加项目标签
                if (server.project) {
                    const projectTag = document.createElement('span');
                    projectTag.className = 'project-tag';
                    projectTag.textContent = server.project;
                    serverLabel.appendChild(projectTag);
                }
                
                // 添加环境标签
                if (server.envType) {
                    const envTag = document.createElement('span');
                    envTag.className = `env-tag ${server.envType}`;
                    envTag.textContent = {
                        'test': '测试',
                        'gray': '灰度',
                        'prod': '生产'
                    }[server.envType] || server.envType;
                    serverLabel.appendChild(envTag);
                }
                
                // 添加服务器名称
                const nameSpan = document.createElement('span');
                nameSpan.textContent = server.label || server.project;
                serverLabel.appendChild(nameSpan);
                
                // 添加按钮
                const buttonContainer = document.createElement('div');
                buttonContainer.className = 'server-actions';
                
                const editButton = document.createElement('button');
                editButton.className = 'small-button';
                editButton.textContent = '编辑';
                editButton.onclick = (e) => {
                    e.stopPropagation();
                    editServer(server, index);
                };
                
                const deleteButton = document.createElement('button');
                deleteButton.className = 'small-button delete-button';
                deleteButton.textContent = '删除';
                deleteButton.onclick = (e) => {
                    e.stopPropagation();
                    deleteServer(index);
                };
                
                buttonContainer.appendChild(editButton);
                buttonContainer.appendChild(deleteButton);
                
                serverInfo.appendChild(serverLabel);
                serverElement.appendChild(serverInfo);
                serverElement.appendChild(buttonContainer);
                
                // 添加点击事件
                serverElement.onclick = () => connectToServer(server);
                
                serverList.appendChild(serverElement);
            });
            
            // 添加筛选器事件监听器
            projectFilter._changeHandler = async () => {
                console.log('项目筛选变更:', projectFilter.value);
                await chrome.storage.local.set({
                    filterState: {
                        project: projectFilter.value,
                        env: envFilter.value
                    }
                });
                await showServerList();
            };
            
            envFilter._changeHandler = async () => {
                console.log('环境筛选变更:', envFilter.value);
                await chrome.storage.local.set({
                    filterState: {
                        project: projectFilter.value,
                        env: envFilter.value
                    }
                });
                await showServerList();
            };
            
            projectFilter.addEventListener('change', projectFilter._changeHandler);
            envFilter.addEventListener('change', envFilter._changeHandler);
            
            console.log('服务器列表显示完成');
        } catch (error) {
            console.error('显示服务器列表失败:', error);
            showNotification('显示服务器列表失败: ' + error.message, { type: 'error' });
        }
    }

    // 添加过滤器事件监听
    document.getElementById('projectFilter').addEventListener('change', async () => {
        await showServerList();
    });
    document.getElementById('envFilter').addEventListener('change', async () => {
        await showServerList();
    });

    // 删除服务器
    async function deleteServer(index) {
        try {
            const { servers = [] } = await chrome.storage.sync.get('servers');
            servers.splice(index, 1);
            await chrome.storage.sync.set({ servers });
            showNotification('服务器已删除', { type: 'success' });
            showServerList();
        } catch (error) {
            console.error('删除服务器失败:', error);
            showNotification('删除服务器失败: ' + error.message, { type: 'error' });
        }
    }

    // 显示任务列表
    function showJobsList(data) {
        // 隐藏其他页面
        savedServers.style.display = 'none';
        addServerForm.style.display = 'none';
        editServerForm.style.display = 'none';
        
        // 显示任务列表容器
        jobsList.style.display = 'block';
        jobsContainer.style.display = 'block';
        
        // 清空搜索框和任务容器
        searchInput.value = '';
        jobsContainer.innerHTML = '';

        // 更新视图筛选器
        const viewFilter = document.getElementById('viewFilter');
        // 移除旧的事件监听器
        if (viewFilter._changeHandler) {
            viewFilter.removeEventListener('change', viewFilter._changeHandler);
        }
        viewFilter.innerHTML = '<option value="">所有视图</option>';
        if (data.views && data.views.length > 0) {
            data.views.forEach(view => {
                const option = document.createElement('option');
                option.value = view.name;
                option.textContent = view.name;
                if (data.currentView === view.name) {
                    option.selected = true;
                }
                viewFilter.appendChild(option);
            });
        }

        // 添加视图筛选事件监听
        viewFilter._changeHandler = async (e) => {
            e.preventDefault(); // 阻止默认行为
            e.stopPropagation(); // 阻止事件冒泡
            
            const selectedView = viewFilter.value;
            if (currentServer) {
                try {
                    // 显示加载提示
                    jobsContainer.innerHTML = '<div class="loading">加载中...</div>';
                    
                    // 更新当前服务器的视图选择
                    currentServer.currentView = selectedView || null;
                    
                    // 获取新的数据
                    const newData = await fetchJenkinsJobs(currentServer);
                    
                    // 保存最后访问的服务器状态（包括当前视图）
                    await chrome.storage.local.set({ 
                        lastServer: {
                            ...currentServer,
                            currentView: selectedView || null
                        }
                    });

                    // 更新视图
                    showJobsList(newData);
                } catch (error) {
                    console.error('切换视图失败:', error);
                    showNotification('切换视图失败: ' + error.message, { type: 'error' });
                    // 显示错误信息
                    jobsContainer.innerHTML = '<div class="error">加载失败，请重试</div>';
                    // 重置视图选择
                    if (data.currentView) {
                        viewFilter.value = data.currentView;
                    } else {
                        viewFilter.value = '';
                    }
                }
            }
        };
        viewFilter.addEventListener('change', viewFilter._changeHandler);

        // 显示任务列表
        if (!data.jobs || data.jobs.length === 0) {
            jobsContainer.innerHTML = '<div class="no-jobs">没有找到任何任务</div>';
            return;
        }

        // 移除旧的搜索事件监听器
        if (searchInput._inputHandler) {
            searchInput.removeEventListener('input', searchInput._inputHandler);
        }
        
        // 添加搜索功能
        searchInput._inputHandler = (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const jobElements = jobsContainer.getElementsByClassName('job-item');
            
            Array.from(jobElements).forEach(jobElement => {
                const jobName = jobElement.querySelector('.job-name').textContent.toLowerCase();
                jobElement.style.display = jobName.includes(searchTerm) ? '' : 'none';
            });
        };
        searchInput.addEventListener('input', searchInput._inputHandler);

        // 创建并显示任务列表
        data.jobs.forEach(job => {
            const jobElement = createJobElement(job);
            jobsContainer.appendChild(jobElement);
        });
    }

    // 连接到服务器
    async function connectToServer(server) {
        try {
            const jobs = await fetchJenkinsJobs(server);
            currentServer = server;
            // 保存最后访问的服务器
            await chrome.storage.local.set({ lastServer: server });
            showJobsList(jobs);
        } catch (error) {
            console.error('连接服务器失败:', error);
            showNotification('连接服务器失败: ' + error.message, { type: 'error' });
        }
    }

    // 添加事件监听器
    addServerButton.addEventListener('click', () => {
        savedServers.style.display = 'none';
        addServerForm.style.display = 'block';
        saveFormState();
    });

    backToList.addEventListener('click', () => {
        addServerForm.style.display = 'none';
        savedServers.style.display = 'block';
        saveFormState();
    });

    backToServers.addEventListener('click', () => {
        // 清除刷新定时器
        if (window.refreshTimer) {
            clearInterval(window.refreshTimer);
        }
        
        // 隐藏任务列表相关元素
        jobsList.style.display = 'none';
        jobsContainer.style.display = 'none';
        
        // 显示服务器列表
        savedServers.style.display = 'block';
        saveFormState();
    });

    refreshJobs.addEventListener('click', async () => {
        if (currentServer) {
            try {
                const jobs = await fetchJenkinsJobs(currentServer);
                showJobsList(jobs);
                showNotification('任务列表已刷新', { type: 'success' });
            } catch (error) {
                console.error('刷新任务列表失败:', error);
                showNotification('刷新失败: ' + error.message, { type: 'error' });
            }
        }
    });

    // 连接Jenkins服务器
    connectButton.addEventListener('click', async (e) => {
        try {
            // 阻止默认行为
            e.preventDefault();
            
            // 禁用按钮，防止重复点击
            connectButton.disabled = true;
            connectButton.textContent = '连接中...';
            
            const jenkinsUrl = document.getElementById('jenkinsUrl').value.trim();
            const username = document.getElementById('username').value.trim();
            const token = document.getElementById('token').value.trim();
            const serverLabel = document.getElementById('serverLabel').value.trim();
            const projectName = document.getElementById('projectName').value.trim();
            const envType = document.getElementById('envType').value;

            if (!jenkinsUrl || !username || !token || !projectName) {
                showNotification('请填写所有必填字段', { type: 'error' });
                return;
            }

            console.log('尝试连接Jenkins服务器:', jenkinsUrl);
            const server = {
                url: jenkinsUrl,
                username: username,
                token: token,
                label: serverLabel,
                project: projectName,
                envType: envType
            };

            // 测试连接
            console.log('获取Jenkins任务列表...');
            const jobs = await fetchJenkinsJobs(server);
            console.log('获取到的任务列表:', jobs);
            
            if (jobs) {
                // 保存服务器信息
                const saved = await saveServer(server);
                if (saved) {
                    currentServer = server;
                    
                    // 清空表单
                    clearForm();
                    
                    // 显示服务器列表
                    savedServers.style.display = 'block';
                    addServerForm.style.display = 'none';
                    jobsList.style.display = 'none';
                    
                    // 刷新服务器列表
                    await showServerList();
                    
                    showNotification('连接成功', { type: 'success' });
                }
            }
        } catch (error) {
            console.error('连接失败:', error);
            showNotification('连接失败: ' + error.message, { type: 'error' });
        } finally {
            // 恢复按钮状态
            connectButton.disabled = false;
            connectButton.textContent = '连接';
        }
    });

    // 获取Jenkins任务列表
    async function fetchJenkinsJobs(server) {
        try {
            // 处理URL，确保格式正确
            let baseUrl = server.url.trim();
            
            // 如果URL不是以http或https开头，添加http://
            if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
                baseUrl = 'http://' + baseUrl;
            }
            
            // 移除URL末尾的斜杠
            baseUrl = baseUrl.replace(/\/+$/, '');

            // 构建API URL，使用encodeURIComponent处理特殊字符
            const treeParam = encodeURIComponent('jobs[name,url,color,lastSuccessfulBuild[timestamp]],views[name,url]');
            
            // 如果服务器已经有成功的API路径，直接使用
            if (server.apiPath) {
                const apiUrl = `${baseUrl}${server.apiPath}?tree=${treeParam}`;
                console.log('使用已知的API路径:', apiUrl);
                
                const response = await fetch(apiUrl, {
                    headers: {
                        'Authorization': 'Basic ' + btoa(`${server.username}:${server.token}`),
                        'Accept': 'application/json'
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    return await processJenkinsData(data, server, baseUrl, server.apiPath);
                }
                
                // 如果失败，清除保存的路径，重新尝试其他路径
                console.log('已保存的API路径失效，尝试其他路径');
                server.apiPath = null;
            }
            
            // 尝试不同的API路径
            const apiPaths = [
                '/api/json',                    // 默认路径
                '/jenkins/api/json',            // Jenkins子路径
            ];

            let lastError = null;
            for (const apiPath of apiPaths) {
                try {
                    const apiUrl = `${baseUrl}${apiPath}?tree=${treeParam}`;
                    console.log('尝试连接Jenkins API:', {
                        url: apiUrl,
                        server: baseUrl,
                        path: apiPath
                    });

                    const response = await fetch(apiUrl, {
                        headers: {
                            'Authorization': 'Basic ' + btoa(`${server.username}:${server.token}`),
                            'Accept': 'application/json'
                        }
                    });

                    if (response.ok) {
                        const data = await response.json();
                        // 保存成功的API路径
                        server.apiPath = apiPath;
                        return await processJenkinsData(data, server, baseUrl, apiPath);
                    }
                    
                    // 如果响应不成功，记录错误信息
                    const errorText = await response.text();
                    lastError = `HTTP ${response.status}: ${errorText}`;
                } catch (error) {
                    lastError = error.message;
                    continue;
                }
            }
            
            throw new Error(`无法连接到Jenkins服务器。\n最后的错误: ${lastError}\n请检查：\n1. 服务器地址是否正确\n2. 用户名和API Token是否有效\n3. Jenkins服务器是否可访问\n4. 网络连接是否正常`);
        } catch (error) {
            console.error('Jenkins API调用失败:', {
                error: error.message,
                stack: error.stack,
                server: server.url
            });
            throw error;
        }
    }

    // 处理Jenkins返回的数据
    async function processJenkinsData(data, server, baseUrl, apiPath) {
        // 如果有选中的视图，获取视图数据
        if (server.currentView && data.views) {
            const view = data.views.find(v => v.name === server.currentView);
            if (view) {
                const viewTreeParam = encodeURIComponent('jobs[name,url,color,lastSuccessfulBuild[timestamp]]');
                const basePath = apiPath.replace('/api/json', '');
                const viewApiUrl = `${baseUrl}${basePath}/view/${encodeURIComponent(server.currentView)}/api/json?tree=${viewTreeParam}`;
                
                try {
                    const viewResponse = await fetch(viewApiUrl, {
                        headers: {
                            'Authorization': 'Basic ' + btoa(`${server.username}:${server.token}`),
                            'Accept': 'application/json'
                        }
                    });

                    if (viewResponse.ok) {
                        const viewData = await viewResponse.json();
                        if (viewData.jobs && viewData.jobs.length > 0) {
                            return {
                                jobs: viewData.jobs,
                                views: data.views,
                                currentView: server.currentView
                            };
                        }
                    }
                } catch (error) {
                    console.warn('获取视图数据失败:', error);
                }
            }
            console.warn('视图数据获取失败，回退到所有任务');
        }

        return {
            jobs: data.jobs || [],
            views: data.views || [],
            currentView: server.currentView || null
        };
    }

    function formatTimeDiff(timestamp) {
        if (!timestamp) return '从未成功构建';
        
        const now = new Date().getTime();
        const diff = now - timestamp;
        
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        
        if (days > 0) return `${days}天前`;
        if (hours > 0) return `${hours}小时前`;
        if (minutes > 0) return `${minutes}分钟前`;
        return '刚刚';
    }

    function createJobElement(job) {
        const jobElement = document.createElement('div');
        // 检查是否在构建中（job.color 包含 '_anime' 后缀）
        const isBuilding = job.color && job.color.endsWith('_anime');
        jobElement.className = `job-item${isBuilding ? ' building' : ''}`;
        
        const jobInfo = document.createElement('div');
        jobInfo.className = 'job-info';
        
        // 添加状态图标
        const statusIcon = document.createElement('span');
        const baseColor = isBuilding ? job.color.replace('_anime', '') : job.color;
        statusIcon.className = `status-icon ${getStatusClass(baseColor)}${isBuilding ? ' building' : ''}`;
        
        const jobName = document.createElement('span');
        jobName.className = 'job-name';
        
        // 创建任务链接
        const jobLink = document.createElement('a');
        // 从job.url中提取相对路径
        try {
            const jobUrlObj = new URL(job.url);
            const relativePath = jobUrlObj.pathname;
            // 使用currentServer的URL构建完整链接
            let baseUrl = currentServer.url.trim();
            // 如果URL不是以http或https开头，添加http://
            if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
                baseUrl = 'http://' + baseUrl;
            }
            // 移除URL末尾的斜杠
            baseUrl = baseUrl.replace(/\/+$/, '');
            // 构建完整URL
            jobLink.href = `${baseUrl}${relativePath}`;
        } catch (error) {
            console.warn('解析任务URL失败，使用原始URL:', error);
            jobLink.href = job.url;
        }
        
        jobLink.textContent = job.name;
        jobLink.onclick = (e) => {
            e.preventDefault();
            chrome.tabs.create({ url: jobLink.href });
        };
        jobName.appendChild(jobLink);
        
        const lastSuccessTime = document.createElement('span');
        lastSuccessTime.className = 'last-success-time';
        const timestamp = job.lastSuccessfulBuild ? job.lastSuccessfulBuild.timestamp : null;
        lastSuccessTime.textContent = `上次成功: ${formatTimeDiff(timestamp)}`;
        
        const buildButton = document.createElement('button');
        buildButton.className = 'build-button small-button';
        buildButton.textContent = isBuilding ? '构建中...' : '构建';
        buildButton.disabled = isBuilding;
        buildButton.onclick = async (e) => {
            e.stopPropagation(); // 防止事件冒泡
            if (!isBuilding) {
                try {
                    buildButton.disabled = true;
                    buildButton.textContent = '构建中...';
                    await triggerBuild(jobLink.href, currentServer);
                } catch (error) {
                    console.error('触发构建失败:', error);
                    showNotification('触发构建失败: ' + error.message, { type: 'error' });
                    buildButton.disabled = false;
                    buildButton.textContent = '构建';
                }
            }
        };
        
        jobInfo.appendChild(statusIcon);
        jobInfo.appendChild(jobName);
        jobInfo.appendChild(lastSuccessTime);
        jobElement.appendChild(jobInfo);
        jobElement.appendChild(buildButton);
        
        return jobElement;
    }

    // 获取状态样式类
    function getStatusClass(color) {
        switch (color) {
            case 'blue': return 'status-success';
            case 'red': return 'status-failed';
            case 'yellow': return 'status-unstable';
            case 'grey':
            case 'disabled':
            case 'notbuilt': return 'status-disabled';
            case 'aborted': return 'status-aborted';
            default: return 'status-unknown';
        }
    }

    // 保存服务器信息
    async function saveServer(server) {
        try {
            console.log('开始保存服务器信息...');
            // 先获取现有的服务器列表
            const { servers = [] } = await chrome.storage.sync.get(['servers']);
            console.log('当前存储中的服务器列表:', servers);
            
            // 添加新服务器
            const newServers = [...servers, server];
            console.log('更新后的服务器列表:', newServers);
            
            // 保存更新后的列表
            await chrome.storage.sync.set({ servers: newServers });
            
            // 验证保存是否成功
            const { servers: savedServers } = await chrome.storage.sync.get(['servers']);
            console.log('验证保存后的服务器列表:', savedServers);
            
            if (savedServers && savedServers.length === newServers.length) {
                console.log('服务器信息保存成功');
                return true;
            } else {
                throw new Error('服务器信息保存验证失败');
            }
        } catch (error) {
            console.error('保存服务器信息失败:', error);
            throw error;
        }
    }

    // 显示通知
    function showNotification(message, options = {}) {
        // 创建提示框元素
        const toast = document.createElement('div');
        toast.className = `toast ${options.type || 'info'}`;
        
        // 创建消息文本元素
        const messageText = document.createElement('span');
        messageText.textContent = message;
        toast.appendChild(messageText);
        
        // 创建关闭按钮
        const closeButton = document.createElement('span');
        closeButton.className = 'toast-close';
        closeButton.innerHTML = '×';
        closeButton.onclick = () => {
            toast.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 300);
        };
        toast.appendChild(closeButton);
        
        // 添加到页面
        document.body.appendChild(toast);

        // 显示提示框
        setTimeout(() => {
            toast.classList.add('show');
        }, 100);

        // 3秒后自动隐藏
        setTimeout(() => {
            if (document.body.contains(toast)) {
                toast.classList.remove('show');
                setTimeout(() => {
                    if (document.body.contains(toast)) {
                        document.body.removeChild(toast);
                    }
                }, 300);
            }
        }, 3000);

        // 同时也发送系统通知
        const notificationOptions = {
            type: 'basic',
            iconUrl: 'images/icon128.png',
            title: 'Jenkins Plus',
            message: message
        };

        chrome.notifications.create(notificationOptions);
    }

    // 清空表单
    function clearForm() {
        document.getElementById('jenkinsUrl').value = '';
        document.getElementById('username').value = '';
        document.getElementById('token').value = '';
        document.getElementById('serverLabel').value = '';
    }

    // 保存表单状态
    function saveFormState() {
        const formState = {
            addServerForm: {
                jenkinsUrl: document.getElementById('jenkinsUrl').value,
                username: document.getElementById('username').value,
                token: document.getElementById('token').value,
                serverLabel: document.getElementById('serverLabel').value,
                projectName: document.getElementById('projectName').value,
                envType: document.getElementById('envType').value
            },
            editServerForm: {
                jenkinsUrl: document.getElementById('editJenkinsUrl').value,
                username: document.getElementById('editUsername').value,
                token: document.getElementById('editToken').value,
                serverLabel: document.getElementById('editServerLabel').value,
                projectName: document.getElementById('editProjectName').value,
                envType: document.getElementById('editEnvType').value
            },
            currentView: savedServers.style.display === 'block' ? 'servers' :
                        addServerForm.style.display === 'block' ? 'addForm' :
                        editServerForm.style.display === 'block' ? 'editForm' :
                        jobsList.style.display === 'block' ? 'jobs' : 'servers',
            searchInput: document.getElementById('searchJobs').value,
            viewFilter: document.getElementById('viewFilter').value,
            projectFilter: document.getElementById('projectFilter').value,
            envFilter: document.getElementById('envFilter').value
        };
        chrome.storage.local.set({ formState });
    }

    // 恢复表单状态
    async function restoreFormState() {
        const { formState } = await chrome.storage.local.get('formState');
        if (!formState) return;

        // 恢复表单内容
        if (formState.addServerForm) {
            document.getElementById('jenkinsUrl').value = formState.addServerForm.jenkinsUrl || '';
            document.getElementById('username').value = formState.addServerForm.username || '';
            document.getElementById('token').value = formState.addServerForm.token || '';
            document.getElementById('serverLabel').value = formState.addServerForm.serverLabel || '';
            document.getElementById('projectName').value = formState.addServerForm.projectName || '';
            document.getElementById('envType').value = formState.addServerForm.envType || 'test';
        }

        if (formState.editServerForm) {
            document.getElementById('editJenkinsUrl').value = formState.editServerForm.jenkinsUrl || '';
            document.getElementById('editUsername').value = formState.editServerForm.username || '';
            document.getElementById('editToken').value = formState.editServerForm.token || '';
            document.getElementById('editServerLabel').value = formState.editServerForm.serverLabel || '';
            document.getElementById('editProjectName').value = formState.editServerForm.projectName || '';
            document.getElementById('editEnvType').value = formState.editServerForm.envType || 'test';
        }

        // 恢复搜索和筛选器状态
        document.getElementById('searchJobs').value = formState.searchInput || '';
        if (formState.viewFilter) document.getElementById('viewFilter').value = formState.viewFilter;
        if (formState.projectFilter) document.getElementById('projectFilter').value = formState.projectFilter;
        if (formState.envFilter) document.getElementById('envFilter').value = formState.envFilter;

        // 恢复当前视图
        switch (formState.currentView) {
            case 'servers':
                savedServers.style.display = 'block';
                addServerForm.style.display = 'none';
                editServerForm.style.display = 'none';
                jobsList.style.display = 'none';
                break;
            case 'addForm':
                savedServers.style.display = 'none';
                addServerForm.style.display = 'block';
                editServerForm.style.display = 'none';
                jobsList.style.display = 'none';
                break;
            case 'editForm':
                savedServers.style.display = 'none';
                addServerForm.style.display = 'none';
                editServerForm.style.display = 'block';
                jobsList.style.display = 'none';
                break;
            case 'jobs':
                savedServers.style.display = 'none';
                addServerForm.style.display = 'none';
                editServerForm.style.display = 'none';
                jobsList.style.display = 'block';
                break;
        }
    }

    // 在页面关闭前保存状态
    window.addEventListener('unload', saveFormState);

    // 修改init函数，调整恢复状态的顺序
    async function init() {
        await showServerList();
        const { formState } = await chrome.storage.local.get('formState');
        
        if (formState) {
            await restoreFormState();  // 恢复表单状态
            // 如果不是在任务列表页面，就不需要恢复服务器状态
            if (formState.currentView !== 'jobs') {
                return;
            }
        }
        
        // 只有在没有保存的表单状态，或者在任务列表页面时，才尝试恢复服务器状态
        try {
            const { lastServer } = await chrome.storage.local.get('lastServer');
            if (lastServer) {
                currentServer = lastServer;
                const jobs = await fetchJenkinsJobs(lastServer);
                showJobsList(jobs);
            } else {
                const { servers = [] } = await chrome.storage.sync.get('servers');
                if (servers.length > 0) {
                    currentServer = servers[0];
                    const jobs = await fetchJenkinsJobs(currentServer);
                    showJobsList(jobs);
                }
            }
        } catch (error) {
            console.error('加载任务列表失败:', error);
            // 如果没有保存的表单状态，才显示服务器列表
            if (!formState) {
                savedServers.style.display = 'block';
                addServerForm.style.display = 'none';
                jobsList.style.display = 'none';
                editServerForm.style.display = 'none';
            }
        }
    }

    // 编辑服务器
    function editServer(server, index) {
        editingServerIndex = index;
        
        // 填充表单
        document.getElementById('editProjectName').value = server.project || '';
        document.getElementById('editEnvType').value = server.envType || 'test';
        document.getElementById('editJenkinsUrl').value = server.url || '';
        document.getElementById('editUsername').value = server.username || '';
        document.getElementById('editToken').value = ''; // 不显示原有token
        document.getElementById('editServerLabel').value = server.label || '';

        // 显示编辑表单
        savedServers.style.display = 'none';
        editServerForm.style.display = 'block';
    }

    // 返回列表
    backToListFromEdit.addEventListener('click', () => {
        editServerForm.style.display = 'none';
        savedServers.style.display = 'block';
        saveFormState();
    });

    // 保存编辑
    saveButton.addEventListener('click', async () => {
        try {
            const { servers = [] } = await chrome.storage.sync.get('servers');
            if (editingServerIndex === -1 || !servers[editingServerIndex]) {
                throw new Error('找不到要编辑的服务器');
            }

            const updatedServer = {
                ...servers[editingServerIndex],
                project: document.getElementById('editProjectName').value.trim(),
                envType: document.getElementById('editEnvType').value,
                url: document.getElementById('editJenkinsUrl').value.trim(),
                username: document.getElementById('editUsername').value.trim(),
                label: document.getElementById('editServerLabel').value.trim()
            };

            // 如果输入了新token，则更新token
            const newToken = document.getElementById('editToken').value.trim();
            if (newToken) {
                updatedServer.token = newToken;
            }

            // 验证必填字段
            if (!updatedServer.url || !updatedServer.username || !updatedServer.project) {
                throw new Error('请填写所有必填字段');
            }

            // 测试连接
            const testResult = await fetchJenkinsJobs(updatedServer);
            if (testResult) {
                servers[editingServerIndex] = updatedServer;
                await chrome.storage.sync.set({ servers });
                showNotification('服务器信息已更新', { type: 'success' });
                editServerForm.style.display = 'none';
                savedServers.style.display = 'block';
                await showServerList();
            }
        } catch (error) {
            console.error('保存失败:', error);
            showNotification('保存失败: ' + error.message, { type: 'error' });
        }
    });

    // 触发构建
    async function triggerBuild(jobUrl, server) {
        try {
            // 处理URL，确保格式正确
            let baseUrl = server.url.trim();
            
            // 如果URL不是以http或https开头，添加http://
            if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
                baseUrl = 'http://' + baseUrl;
            }
            
            // 移除URL末尾的斜杠
            baseUrl = baseUrl.replace(/\/+$/, '');
            
            // 获取job路径
            const jobUrlObj = new URL(jobUrl);
            const jobPath = jobUrlObj.pathname;
            
            // 获取crumb，使用已知的API路径
            const apiPath = server.apiPath || '';
            const crumbUrl = `${baseUrl}${apiPath.replace('/api/json', '')}/crumbIssuer/api/json`;
            console.log('获取crumb:', crumbUrl);
            
            const crumbResponse = await fetch(crumbUrl, {
                headers: {
                    'Authorization': 'Basic ' + btoa(`${server.username}:${server.token}`),
                    'Accept': 'application/json'
                }
            });
            
            if (!crumbResponse.ok) {
                throw new Error(`获取crumb失败: ${crumbResponse.status}`);
            }
            
            const crumbData = await crumbResponse.json();
            
            // 触发构建
            const buildUrl = `${baseUrl}${jobPath}/build`;
            console.log('触发构建:', buildUrl);
            
            const buildResponse = await fetch(buildUrl, {
                method: 'POST',
                headers: {
                    'Authorization': 'Basic ' + btoa(`${server.username}:${server.token}`),
                    'Accept': 'application/json',
                    [crumbData.crumbRequestField]: crumbData.crumb
                }
            });
            
            if (!buildResponse.ok) {
                const errorText = await buildResponse.text();
                throw new Error(`触发构建失败: ${buildResponse.status}, ${errorText}`);
            }
            
            showNotification('构建已触发', { type: 'success' });
            
            // 开始监控构建状态
            pollBuildStatus(jobUrl, server);
        } catch (error) {
            console.error('触发构建失败:', error);
            showNotification('触发构建失败: ' + error.message, { type: 'error' });
        }
    }

    // 监控构建状态
    async function pollBuildStatus(jobUrl, server) {
        try {
            // 处理URL，确保格式正确
            let baseUrl = server.url.trim();
            if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
                baseUrl = 'http://' + baseUrl;
            }
            baseUrl = baseUrl.replace(/\/+$/, '');

            // 获取job路径
            const jobUrlObj = new URL(jobUrl);
            const jobPath = jobUrlObj.pathname;

            // 构建lastBuild API URL
            const apiPath = server.apiPath || '';
            const buildStatusUrl = `${baseUrl}${jobPath}/lastBuild/api/json`;
            console.log('检查构建状态:', buildStatusUrl);

            const checkStatus = async () => {
                try {
                    const response = await fetch(buildStatusUrl, {
                        headers: {
                            'Authorization': 'Basic ' + btoa(`${server.username}:${server.token}`),
                            'Accept': 'application/json'
                        }
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const data = await response.json();
                    
                    if (data.building) {
                        // 如果还在构建中，继续轮询
                        showNotification('构建进行中...', { type: 'info' });
                        setTimeout(checkStatus, 2000); // 2秒后再次检查
                    } else {
                        // 构建完成
                        const success = data.result === 'SUCCESS';
                        showNotification(
                            `构建${success ? '成功' : '失败'}${data.description ? ': ' + data.description : ''}`,
                            { type: success ? 'success' : 'error' }
                        );
                    }
                } catch (error) {
                    console.error('检查构建状态失败:', error);
                    showNotification('检查构建状态失败: ' + error.message, { type: 'error' });
                }
            };

            // 延迟2秒后开始第一次检查
            setTimeout(checkStatus, 2000);
        } catch (error) {
            console.error('监控构建状态失败:', error);
            showNotification('监控构建状态失败: ' + error.message, { type: 'error' });
        }
    }

    init().catch(console.error);
}); 