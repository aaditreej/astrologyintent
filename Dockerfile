FROM nginx:alpine

COPY index.html /usr/share/nginx/html/index.html
COPY astrology-interest-banner.png /usr/share/nginx/html/astrology-interest-banner.png
COPY astrology-interest-banner@2x.png /usr/share/nginx/html/astrology-interest-banner@2x.png

EXPOSE 80
