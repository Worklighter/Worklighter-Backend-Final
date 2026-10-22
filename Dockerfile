#*BEFORE CREATING DOCKER IMAGE, execute npm run compile:staging/prod to create a build folder with updated code

FROM node:22-slim


WORKDIR /

COPY build/ /
COPY package.json /
COPY package-lock.json /

RUN npm ci --omit=dev --legacy-peer-deps

EXPOSE 8007

CMD ["node", "index.js"]
