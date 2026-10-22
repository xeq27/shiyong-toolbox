# The release context contains only this file, nginx.conf, and the public toolbox assets.
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY proxy_params.conf /etc/nginx/proxy_params_shiyong.conf
COPY public/ /usr/share/nginx/html/
EXPOSE 80
